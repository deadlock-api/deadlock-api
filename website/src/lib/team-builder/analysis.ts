import type { AnalyticsHeroStats, HeroCounterStats, HeroSynergyStats, LaneMatchupStats } from "deadlock_api_client";

import { LANES, type LaneInfo, laneOfSlot, slotsOfLane, TEAM_SIZE } from "./lanes";

/**
 * A draft is `TEAM_SIZE` ordered slots per side; `null` is an empty slot. The slot index carries
 * the lane assignment (see `laneOfSlot`), so no separate lane mapping has to be tracked.
 */
export interface Draft {
  ally: (number | null)[];
  enemy: (number | null)[];
}

export type Side = "ally" | "enemy";

export interface Sample {
  wins: number;
  matches: number;
}

const pairKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
const duoKey = (duo: number[]) => [...duo].sort((x, y) => x - y).join(",");
const laneKey = (lane: number, ally: number[], enemy: number[]) => `${lane}|${duoKey(ally)}|${duoKey(enemy)}`;

const rate = (s: Sample | undefined) => (s && s.matches > 0 ? s.wins / s.matches : undefined);

/** A rate in `[0,1]` as win-rate points either side of an even match. */
export const toPoints = (value: number | undefined) => (value === undefined ? undefined : (value - 0.5) * 100);

/**
 * A duo-vs-duo lane sample thinner than this is noise; the lane edge is estimated from the four
 * individual same-lane matchups instead, which is a far denser population for the same question.
 */
const MIN_LANE_DUO_MATCHES = 20;

/** Every hero-pair / matchup number the model needs, indexed for O(1) lookup during recompute. */
export class StatsIndex {
  private readonly hero = new Map<number, Sample>();
  private readonly pairs = new Map<string, Sample>();
  private readonly counters = new Map<string, Sample>();
  private readonly laneCounters = new Map<string, Sample>();
  private readonly lanes = new Map<string, Sample>();
  private readonly laneSouls = new Map<string, { diff: number; matches: number }>();

  constructor(
    heroStats: AnalyticsHeroStats[] = [],
    synergies: HeroSynergyStats[] = [],
    counters: HeroCounterStats[] = [],
    laneCounters: HeroCounterStats[] = [],
    laneMatchups: LaneMatchupStats[] = [],
  ) {
    const indexCounters = (rows: HeroCounterStats[], into: Map<string, Sample>) => {
      for (const s of rows) into.set(`${s.hero_id}:${s.enemy_hero_id}`, { wins: s.wins, matches: s.matches_played });
    };
    indexCounters(counters, this.counters);
    indexCounters(laneCounters, this.laneCounters);

    for (const s of heroStats) {
      const prev = this.hero.get(s.hero_id);
      // hero-stats is bucketed; fold the buckets back into one baseline per hero.
      this.hero.set(s.hero_id, { wins: (prev?.wins ?? 0) + s.wins, matches: (prev?.matches ?? 0) + s.matches });
    }
    for (const s of synergies) {
      this.pairs.set(pairKey(s.hero_id1, s.hero_id2), { wins: s.wins, matches: s.matches_played });
    }
    for (const s of laneMatchups) {
      const key = laneKey(s.assigned_lane, s.hero_ids, s.enemy_hero_ids);
      this.lanes.set(key, { wins: s.wins, matches: s.matches_played });
      if (s.net_worth_matches > 0) {
        this.laneSouls.set(key, { diff: s.net_worth_diff_9min, matches: s.net_worth_matches });
      }
    }
  }

  heroSample(heroId: number): Sample | undefined {
    return this.hero.get(heroId);
  }

  pairSample(a: number, b: number): Sample | undefined {
    return this.pairs.get(pairKey(a, b));
  }

  counterSample(hero: number, enemy: number): Sample | undefined {
    return this.counters.get(`${hero}:${enemy}`);
  }

  /** The same matchup restricted to games where the two heroes shared a lane. */
  laneCounterSample(hero: number, enemy: number): Sample | undefined {
    return this.laneCounters.get(`${hero}:${enemy}`);
  }

  laneSample(lane: number, ally: number[], enemy: number[]): Sample | undefined {
    return this.lanes.get(laneKey(lane, ally, enemy));
  }

  /** Mean soul lead of the duo over the enemy duo at the 9 minute mark. */
  laneSoulLead(lane: number, ally: number[], enemy: number[]): { diff: number; matches: number } | undefined {
    return this.laneSouls.get(laneKey(lane, ally, enemy));
  }

  heroWinRate(heroId: number): number | undefined {
    return rate(this.hero.get(heroId));
  }

  /** Points of win rate the hero carries on its own, relative to a coin flip. */
  soloEdge(heroId: number): number | undefined {
    return toPoints(this.heroWinRate(heroId));
  }

  /**
   * What the two heroes win separately — the baseline `synergyDelta` measures the pair against.
   * Both baselines have to be known, so the quoted expectation always matches the quoted delta.
   */
  expectedApart(a: number, b: number): number | undefined {
    const wrA = this.heroWinRate(a);
    const wrB = this.heroWinRate(b);
    return wrA === undefined || wrB === undefined ? undefined : (wrA + wrB) / 2;
  }

  /**
   * Points the pair wins above what its two heroes win separately. Measuring against the pair's own
   * baseline is what makes this synergy rather than "two strong heroes happen to be picked together".
   */
  synergyDelta(a: number, b: number): number | undefined {
    const pair = rate(this.pairSample(a, b));
    const apart = this.expectedApart(a, b);
    if (pair === undefined || apart === undefined) return undefined;
    return (pair - apart) * 100;
  }

  /** Points the hero wins above its own baseline when this enemy is in the game. */
  counterEdge(hero: number, enemy: number): number | undefined {
    const matchup = rate(this.counterSample(hero, enemy));
    const base = this.heroWinRate(hero);
    if (matchup === undefined || base === undefined) return undefined;
    return (matchup - base) * 100;
  }
}

/** Average of the values that are known, or `undefined` when none of them are. */
export const mean = (values: (number | undefined)[]): number | undefined => {
  const known = values.filter((v): v is number => v !== undefined);
  return known.length ? known.reduce((a, b) => a + b, 0) / known.length : undefined;
};

export const filled = (side: (number | null)[]) => side.filter((h): h is number => h !== null);

function unorderedPairs<T>(items: T[]): [T, T][] {
  const out: [T, T][] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) out.push([items[i], items[j]]);
  }
  return out;
}

export interface PairRow {
  a: number;
  b: number;
  delta: number | undefined;
  winRate: number | undefined;
  matches: number;
}

/** One hero against one enemy, as the counter matrix and the lane duel grid both render it. */
export interface MatchupCell {
  hero: number;
  enemy: number;
  edge: number | undefined;
  winRate: number | undefined;
  matches: number;
}

export interface LaneRow {
  lane: LaneInfo;
  ally: number[];
  enemy: number[];
  complete: boolean;
  winRate: number | undefined;
  edge: number | undefined;
  matches: number;
  /** Mean soul lead at 9 minutes, when the exact duo pairing has net-worth samples. */
  soulLead: { diff: number; matches: number } | undefined;
  /** Same-lane hero-versus-hero cells, ally rows by enemy columns. */
  duel: MatchupCell[][];
}

export interface Contribution {
  key: "lanes" | "synergy" | "counters" | "solo";
  label: string;
  /** Win-rate points this term adds to the prediction. */
  value: number | undefined;
  /** Thinnest sample the term rests on, so its weight and its reliability read together. */
  matches: number;
}

export interface DraftAnalysis {
  allyHeroes: number[];
  enemyHeroes: number[];
  /** Predicted win rate for the ally side, in percent. `undefined` while nothing can be computed yet. */
  predicted: number | undefined;
  /** Half-width of the 95% interval around `predicted`, in points. */
  margin: number | undefined;
  contributions: Contribution[];
  allyPairs: PairRow[];
  counterMatrix: MatchupCell[][];
  counterAverages: (number | undefined)[];
  lanes: LaneRow[];
}

/**
 * Propagates the sampling error of every rate the prediction is built from. Each term is a mean of
 * `k` win rates, so its variance is `Σ var_i / k²`, and a win rate measured over `n` matches has
 * variance at most `50²/n` in points. Taking the worst-case `p = 0.5` keeps this conservative
 * without needing each rate's own `p`, and averaging is what stops one thin pairing from blowing
 * the interval up the way a plain "smallest sample" rule does.
 */
function predictionMargin(termSamples: number[][]): number | undefined {
  let variance = 0;
  let terms = 0;
  for (const samples of termSamples) {
    const usable = samples.filter((n) => n > 0);
    if (usable.length === 0) continue;
    variance += usable.reduce((sum, n) => sum + 2500 / n, 0) / usable.length ** 2;
    terms += 1;
  }
  return terms === 0 ? undefined : 1.96 * Math.sqrt(variance);
}

/**
 * The four model terms for a draft, in win-rate points. Kept separate from `analyzeDraft` so a
 * hypothetical swap can be scored through the identical path rather than an approximation of it.
 */
function draftTerms(draft: Draft, index: StatsIndex) {
  const allyHeroes = filled(draft.ally);
  const enemyHeroes = filled(draft.enemy);

  const soloAlly = mean(allyHeroes.map((h) => index.soloEdge(h)));
  const soloEnemy = mean(enemyHeroes.map((h) => index.soloEdge(h)));
  const solo = soloAlly === undefined && soloEnemy === undefined ? undefined : (soloAlly ?? 0) - (soloEnemy ?? 0);

  const synergyAlly = mean(unorderedPairs(allyHeroes).map(([a, b]) => index.synergyDelta(a, b)));
  const synergyEnemy = mean(unorderedPairs(enemyHeroes).map(([a, b]) => index.synergyDelta(a, b)));
  const synergy =
    synergyAlly === undefined && synergyEnemy === undefined ? undefined : (synergyAlly ?? 0) - (synergyEnemy ?? 0);

  const counters = mean(allyHeroes.flatMap((hero) => enemyHeroes.map((enemy) => index.counterEdge(hero, enemy))));
  const lanes = mean(laneEdges(draft, index));

  return { solo, synergy, counters, lanes };
}

function predictedFrom(terms: ReturnType<typeof draftTerms>) {
  const known = [terms.lanes, terms.synergy, terms.counters, terms.solo].filter((v): v is number => v !== undefined);
  return known.length ? Math.min(99, Math.max(1, 50 + known.reduce((sum, v) => sum + v, 0))) : undefined;
}

/** Predicted ally win rate for a draft, in percent. */
function predictDraft(draft: Draft, index: StatsIndex): number | undefined {
  return predictedFrom(draftTerms(draft, index));
}

function pairRows(index: StatsIndex, heroes: number[]): PairRow[] {
  return unorderedPairs(heroes)
    .map(([a, b]) => {
      const sample = index.pairSample(a, b);
      return {
        a,
        b,
        delta: index.synergyDelta(a, b),
        winRate: rate(sample),
        matches: sample?.matches ?? 0,
      };
    })
    .sort((x, y) => (y.delta ?? Number.NEGATIVE_INFINITY) - (x.delta ?? Number.NEGATIVE_INFINITY));
}

/**
 * The lane's win rate: the duo-vs-duo sample when it is thick enough, otherwise the mean of the four
 * individual same-lane matchups. Scalar-only, so the two searches below can evaluate a lane without
 * building the display rows around it.
 */
function laneEstimate(
  index: StatsIndex,
  laneId: number,
  ally: number[],
  enemy: number[],
): { winRate: number | undefined; matches: number } {
  if (ally.length !== 2 || enemy.length !== 2) return { winRate: undefined, matches: 0 };

  const duo = index.laneSample(laneId, ally, enemy);
  if (duo && duo.matches >= MIN_LANE_DUO_MATCHES) {
    return { winRate: duo.wins / duo.matches, matches: duo.matches };
  }

  const known: Sample[] = [];
  for (const hero of ally) {
    for (const enemyHero of enemy) {
      const sample = index.laneCounterSample(hero, enemyHero);
      if (sample && sample.matches > 0) known.push(sample);
    }
  }
  if (known.length === 0) return { winRate: undefined, matches: 0 };
  return {
    winRate: known.reduce((sum, s) => sum + s.wins / s.matches, 0) / known.length,
    // The estimate is only as strong as its thinnest cell, so that is what gets reported.
    matches: Math.min(...known.map((s) => s.matches)),
  };
}

/** The two heroes a side has in a lane, in slot order. */
function duoOf(side: (number | null)[], laneIndex: number): number[] {
  return filled(slotsOfLane(laneIndex).map((s) => side[s]));
}

/** Just the lane term, for the hypothetical drafts the searches score. */
function laneEdges(draft: Draft, index: StatsIndex): (number | undefined)[] {
  return LANES.map((lane, laneIndex) =>
    toPoints(laneEstimate(index, lane.id, duoOf(draft.ally, laneIndex), duoOf(draft.enemy, laneIndex)).winRate),
  );
}

export function laneRows(draft: Draft, index: StatsIndex): LaneRow[] {
  return LANES.map((lane, laneIndex) => {
    const ally = duoOf(draft.ally, laneIndex);
    const enemy = duoOf(draft.enemy, laneIndex);
    const complete = ally.length === 2 && enemy.length === 2;

    const duel: MatchupCell[][] = ally.map((hero) =>
      enemy.map((enemyHero) => {
        const sample = index.laneCounterSample(hero, enemyHero);
        const cellRate = rate(sample);
        return {
          hero,
          enemy: enemyHero,
          winRate: cellRate,
          edge: toPoints(cellRate),
          matches: sample?.matches ?? 0,
        };
      }),
    );

    const estimate = laneEstimate(index, lane.id, ally, enemy);

    return {
      lane,
      ally,
      enemy,
      complete,
      duel,
      soulLead: complete ? index.laneSoulLead(lane.id, ally, enemy) : undefined,
      winRate: estimate.winRate,
      edge: toPoints(estimate.winRate),
      matches: estimate.matches,
    };
  });
}

/**
 * Additive heuristic: start from an even match and add the points each source of edge is worth.
 * Every term is a *mean* rather than a sum, so a partially drafted comp is on the same scale as a
 * full one and no term grows just because there are more heroes to pair up. The terms are kept
 * separable on purpose — the breakdown panel shows exactly these four numbers.
 *
 * Synergy and counters are read from lane-agnostic stats and lane edge from the duo-vs-duo endpoint,
 * so the three measure different things instead of restating the same laning phase three times.
 */
export function analyzeDraft(draft: Draft, index: StatsIndex): DraftAnalysis {
  const allyHeroes = filled(draft.ally);
  const enemyHeroes = filled(draft.enemy);

  const allyPairs = pairRows(index, allyHeroes);
  const enemyPairs = pairRows(index, enemyHeroes);
  const lanes = laneRows(draft, index);

  const counterMatrix: MatchupCell[][] = allyHeroes.map((hero) =>
    enemyHeroes.map((enemy) => {
      const sample = index.counterSample(hero, enemy);
      return {
        hero,
        enemy,
        edge: index.counterEdge(hero, enemy),
        winRate: rate(sample),
        matches: sample?.matches ?? 0,
      };
    }),
  );
  const counterAverages = counterMatrix.map((row) => mean(row.map((c) => c.edge)));

  const terms = draftTerms(draft, index);

  const minOf = (values: number[]) => (values.length ? Math.min(...values) : 0);
  const pairMatches = [...allyPairs, ...enemyPairs].map((p) => p.matches);
  const counterMatches = counterMatrix.flat().map((c) => c.matches);
  const laneMatches = lanes.filter((l) => l.complete).map((l) => l.matches);
  const heroMatches = [...allyHeroes, ...enemyHeroes].map((h) => index.heroSample(h)?.matches ?? 0);

  const contributions: Contribution[] = [
    { key: "lanes", label: "Lane matchups", value: terms.lanes, matches: minOf(laneMatches) },
    { key: "synergy", label: "Pair synergy", value: terms.synergy, matches: minOf(pairMatches) },
    { key: "counters", label: "Counter picks", value: terms.counters, matches: minOf(counterMatches) },
    { key: "solo", label: "Solo hero win rates", value: terms.solo, matches: minOf(heroMatches) },
  ];

  return {
    allyHeroes,
    enemyHeroes,
    predicted: predictedFrom(terms),
    margin: predictionMargin([
      allyPairs.map((p) => p.matches),
      enemyPairs.map((p) => p.matches),
      counterMatches,
      laneMatches,
    ]),
    contributions,
    allyPairs,
    counterMatrix,
    counterAverages,
    lanes,
  };
}

export interface LaneHeroRow {
  heroId: number;
  side: Side;
  winRate: number | undefined;
  edge: number | undefined;
  matches: number;
}

/**
 * Each of a lane's four heroes against the two it lanes into, averaged. Same population as the duel
 * grid, collapsed to one row per hero so the two sides are directly comparable.
 */
export function laneHeroRows(lane: LaneRow): LaneHeroRow[] {
  const entries: { heroId: number; side: Side; cells: MatchupCell[] }[] = [
    ...lane.ally.map((heroId, row) => ({ heroId, side: "ally" as Side, cells: lane.duel[row] })),
    ...lane.enemy.map((heroId, column) => ({
      heroId,
      side: "enemy" as Side,
      cells: lane.duel.map((row) => row[column]),
    })),
  ];

  return entries.map(({ heroId, side, cells }) => {
    const own = mean(cells.map((cell) => cell.winRate));
    // The grid stores the ally view, so an enemy hero's own win rate is the complement of its column.
    const winRate = own === undefined || side === "ally" ? own : 1 - own;
    return {
      heroId,
      side,
      winRate,
      edge: toPoints(winRate),
      matches: cells.reduce((sum, cell) => sum + (cell.winRate === undefined ? 0 : cell.matches), 0),
    };
  });
}

export interface PairEnemyRow {
  enemy: number;
  edge: number | undefined;
  matches: number;
}

/** How a pair fares against each enemy pick: the mean of the two heroes' matchup edges. */
export function pairVsEnemyRows(pair: PairRow, enemyHeroes: number[], index: StatsIndex): PairEnemyRow[] {
  return enemyHeroes.map((enemy) => ({
    enemy,
    edge: mean([index.counterEdge(pair.a, enemy), index.counterEdge(pair.b, enemy)]),
    matches: (index.counterSample(pair.a, enemy)?.matches ?? 0) + (index.counterSample(pair.b, enemy)?.matches ?? 0),
  }));
}

export interface Recommendation {
  heroId: number;
  synergy: number | undefined;
  counter: number | undefined;
  solo: number | undefined;
  winRate: number | undefined;
  matches: number;
  /** Combined points this hero would add, used for the ranking. */
  score: number;
}

/**
 * Ranks every hero that is not already drafted by what it would add to `side`. The lane term is left
 * out on purpose: lane numbers only exist for duos that were actually queried, so including them
 * would rank the few heroes with lane data above everyone else rather than by strength.
 */
export function recommendPicks(
  draft: Draft,
  index: StatsIndex,
  side: Side,
  candidates: number[],
  minMatches = 0,
): Recommendation[] {
  const own = filled(draft[side]);
  const opposing = filled(draft[side === "ally" ? "enemy" : "ally"]);
  const drafted = new Set([...filled(draft.ally), ...filled(draft.enemy)]);

  return candidates
    .filter((heroId) => !drafted.has(heroId))
    .map((heroId) => {
      const synergy = mean(own.map((teammate) => index.synergyDelta(heroId, teammate)));
      const counter = mean(opposing.map((enemy) => index.counterEdge(heroId, enemy)));
      const solo = index.soloEdge(heroId);
      const sample = index.heroSample(heroId);
      return {
        heroId,
        synergy,
        counter,
        solo,
        winRate: index.heroWinRate(heroId),
        matches: sample?.matches ?? 0,
        score: (synergy ?? 0) + (counter ?? 0) + (solo ?? 0),
      };
    })
    .filter((r) => r.matches >= minMatches)
    .sort((a, b) => b.score - a.score);
}

export interface Swap {
  slot: number;
  out: number;
  in: number;
  gain: number;
}

/**
 * Best single replacement per drafted hero, measured as the actual move in the predicted win rate.
 * Every slot that has a better option offers it, so the result is one entry per slot at most.
 *
 * The draft is re-scored with the candidate in place rather than summing per-hero terms: a swap also
 * changes the lane duo it belongs to, and leaving that out made the quoted gain disagree with the
 * number the board then showed.
 */
export function suggestSwaps(draft: Draft, index: StatsIndex, side: Side, candidates: number[]): Swap[] {
  const own = filled(draft[side]);
  const opposing = filled(draft[side === "ally" ? "enemy" : "ally"]);
  const drafted = new Set([...filled(draft.ally), ...filled(draft.enemy)]);
  if (own.length < 2 || opposing.length === 0) return [];

  // Below a tenth of a point the chip would read "+0.0" and suggest a change worth nothing.
  const MIN_GAIN = 0.1;
  const baseline = predictDraft(draft, index);
  if (baseline === undefined) return [];
  // An enemy swap is good for the enemy, so its gain is the drop in the ally prediction.
  const sign = side === "ally" ? 1 : -1;

  // One scratch draft for the whole search: every candidate overwrites the same slot and the
  // original hero is put back before moving on, so nothing here is allocated per candidate.
  const hypothetical: Draft = { ally: [...draft.ally], enemy: [...draft.enemy] };

  const best: Swap[] = [];
  draft[side].forEach((out, slot) => {
    if (out === null) return;
    let bestSwap: Swap | undefined;
    for (const candidate of candidates) {
      if (drafted.has(candidate)) continue;
      hypothetical[side][slot] = candidate;
      const predicted = predictDraft(hypothetical, index);
      if (predicted === undefined) continue;
      const gain = (predicted - baseline) * sign;
      if (gain >= MIN_GAIN && gain > (bestSwap?.gain ?? 0)) bestSwap = { slot, out, in: candidate, gain };
    }
    hypothetical[side][slot] = out;
    if (bestSwap) best.push(bestSwap);
  });

  return best;
}

export interface LaneReassignment {
  /** The side's six slots in their proposed order; index is the slot, value the hero. */
  slots: (number | null)[];
  /** Win-rate points the reshuffle is worth, in the same units as the prediction. */
  gain: number;
  /** The heroes that actually move, with the slot they leave and the slot they take. */
  moves: { heroId: number; fromSlot: number; toSlot: number }[];
}

/**
 * Best way to redistribute a side's own heroes across the three lanes.
 *
 * Only the lane term can change here — the same six heroes keep the same pairs, matchups and solo
 * rates however they are arranged — so the search scores lane edge alone rather than re-predicting
 * the whole draft. The two slots of a lane are interchangeable to `laneRows`, so the search walks
 * the 90 distinct lane splits rather than all 6! = 720 orderings, and still misses nothing.
 */
export function suggestLaneAssignment(draft: Draft, index: StatsIndex, side: Side): LaneReassignment | undefined {
  const current = draft[side];
  const heroes = filled(current);
  if (heroes.length < TEAM_SIZE) return undefined;

  const opposing = draft[side === "ally" ? "enemy" : "ally"];
  // The opposing side is fixed for the whole search, so a lane's edge depends only on which two of
  // this side's heroes sit in it. That collapses the 90 arrangements onto 45 distinct evaluations.
  const cache = new Map<string, number | undefined>();
  const edgeOfLane = (laneIndex: number, duo: number[]) => {
    const key = `${laneIndex}|${duoKey(duo)}`;
    if (!cache.has(key)) {
      const other = duoOf(opposing, laneIndex);
      const [ally, enemy] = side === "ally" ? [duo, other] : [other, duo];
      cache.set(key, toPoints(laneEstimate(index, LANES[laneIndex].id, ally, enemy).winRate));
    }
    return cache.get(key);
  };

  const laneEdgeOf = (slots: (number | null)[]) =>
    mean(LANES.map((_, laneIndex) => edgeOfLane(laneIndex, duoOf(slots, laneIndex))));

  const baseline = laneEdgeOf(current);
  if (baseline === undefined) return undefined;
  // `laneRows` measures every lane from the ally side, so a rearrangement that is good for the enemy
  // shows up as a *drop* in that number. Without this flip the enemy row proposed the split that
  // suits the ally, and applying one side's suggestion could leave the other with nothing to offer.
  const sign = side === "ally" ? 1 : -1;

  let best: LaneReassignment | undefined;
  const permute = (remaining: number[], acc: number[]) => {
    if (remaining.length === 0) {
      const edge = laneEdgeOf(acc);
      if (edge === undefined) return;
      // The lane term is a mean over three lanes and enters the prediction directly, so its
      // improvement *is* the win-rate gain for whichever side is being optimised.
      const gain = (edge - baseline) * sign;
      if (gain > (best?.gain ?? 0.1)) {
        best = {
          slots: [...acc],
          gain,
          // Slots 0/1, 2/3 and 4/5 share a lane, so only a change of *lane* is worth listing.
          moves: acc
            .map((heroId, toSlot) => ({ heroId, toSlot, fromSlot: current.indexOf(heroId) }))
            .filter((move) => laneOfSlot(move.fromSlot).id !== laneOfSlot(move.toSlot).id),
        };
      }
      return;
    }
    for (let i = 0; i < remaining.length; i++) {
      // Slots 0/1, 2/3 and 4/5 pair up, and a lane scores the same either way round: fixing the
      // second of each pair to be the larger hero id keeps one representative per distinct split.
      if (acc.length % 2 === 1 && remaining[i] < acc[acc.length - 1]) continue;
      acc.push(remaining[i]);
      permute([...remaining.slice(0, i), ...remaining.slice(i + 1)], acc);
      acc.pop();
    }
  };
  permute(heroes, []);

  return best;
}
