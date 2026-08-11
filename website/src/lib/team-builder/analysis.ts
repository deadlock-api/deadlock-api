import type {
  AnalyticsHeroStats,
  HeroCounterStats,
  HeroSynergyStats,
  LaneMatchupStats,
  LaneSoulCurve,
} from "deadlock_api_client";

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

/** Mean souls the ally duo led by, `timeS` seconds into the match, with the band around that mean. */
export interface LaneSoulPoint {
  timeS: number;
  diff: number;
  /** 95% confidence bounds on `diff`. */
  lo: number;
  hi: number;
}

/**
 * Half-width of the 95% interval around a mean of `matches` samples with population deviation `std`.
 *
 * The band belongs on the *mean*, so it is the standard error rather than the raw deviation: souls
 * scatter by thousands between games, which says nothing about how well this average is pinned down.
 */
const meanInterval = (std: number, matches: number) => (matches > 0 ? (1.96 * std) / Math.sqrt(matches) : 0);

const pairKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
const duoKey = (duo: number[]) => [...duo].sort((x, y) => x - y).join(",");
const laneKey = (lane: number, ally: number[], enemy: number[]) => `${lane}|${duoKey(ally)}|${duoKey(enemy)}`;

const rate = (s: Sample | undefined) => (s && s.matches > 0 ? s.wins / s.matches : undefined);

const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/** The endpoints are queried with `minMatches: 1`, so a cell can rest on a single game. */
const shrunk = (sample: Sample | undefined, prior: number, k: number) =>
  ((sample?.wins ?? 0) + k * prior) / ((sample?.matches ?? 0) + k);

/**
 * Fitted offline against 2.95M matches, on stats windows of 14, 30 and 56 days at once so the
 * shrinkage holds whichever range the filter asks for.
 *
 * Each term is a residual in log-odds — what it explains that the terms before it do not — which is
 * what keeps every weight positive instead of large opposing numbers cancelling out.
 */
const MODEL = {
  kHero: 42.644182237950695,
  kPair: 1.4857045045494808,
  kCounter: 10.683978070496247,
  kLaneDuel: 84.84019781031493,
  /** Applied in order: each term drops what the earlier ones already account for. */
  residual: [
    [],
    [-0.055780428039267506],
    [0.02708740701388334, -0.046651247349320066],
    [-0.9789111182741357, -0.11369824594208155, -1.1947748577064772],
  ] as readonly (readonly number[])[],
  weights: [5.938602463232448, 12.739331784185998, 33.487383014478006, 3.3804476974274964] as const,
  intercept: 0.0016751056557140426,
} as const;

/** Win-rate points per unit of log-odds at an even match — the slope of the logistic at 50%. */
const POINTS_PER_LOG_ODDS = 25;

/** A rate in `[0,1]` as win-rate points either side of an even match. */
export const toPoints = (value: number | undefined) => (value === undefined ? undefined : (value - 0.5) * 100);

/**
 * A duo-vs-duo lane sample thinner than this is noise; the lane edge is estimated from the four
 * individual same-lane matchups instead, which is a far denser population for the same question.
 */
const MIN_LANE_DUO_MATCHES = 20;

/**
 * The endpoint now follows a matchup to the end of its match. This page only ever asks about the
 * lane, so the rest of the curve is dropped rather than drawn as if the duo were still laning.
 */
const LANING_PHASE_END_S = 900;

/**
 * Kept out of `StatsIndex` on purpose: nothing in the model reads these, and they arrive from their
 * own request. Folding them in would invalidate the index a second time on every pick and re-run the
 * whole prediction and swap search for a chart.
 */
export class SoulCurves {
  private readonly byLane = new Map<string, LaneSoulCurve>();

  constructor(rows: LaneSoulCurve[] = []) {
    for (const s of rows) this.byLane.set(laneKey(s.assigned_lane, s.hero_ids, s.enemy_hero_ids), s);
  }

  get(lane: number, ally: number[], enemy: number[]): LaneSoulPoint[] | undefined {
    const row = this.byLane.get(laneKey(lane, ally, enemy));
    return row?.sample_times_s
      .map((timeS, i) => {
        const diff = row.net_worth_diff[i];
        const half = meanInterval(row.net_worth_diff_std[i] ?? 0, row.matches_played);
        return { timeS, diff, lo: diff - half, hi: diff + half };
      })
      .filter((p) => p.timeS <= LANING_PHASE_END_S);
  }
}

/** Every hero-pair / matchup number the model needs, indexed for O(1) lookup during recompute. */
export class StatsIndex {
  private readonly hero = new Map<number, Sample>();
  private readonly pairs = new Map<string, Sample>();
  private readonly counters = new Map<string, Sample>();
  private readonly laneCounters = new Map<string, Sample>();
  private readonly lanes = new Map<string, Sample>();
  /** Summed over all heroes, wins and matches are 6n and 12n whichever side won, so this is exact. */
  readonly baseRate = 0.5;
  readonly hasData: boolean = false;

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
      this.lanes.set(laneKey(s.assigned_lane, s.hero_ids, s.enemy_hero_ids), {
        wins: s.wins,
        matches: s.matches_played,
      });
    }

    this.hasData = this.hero.size > 0;
  }

  /** Every other term is measured against this, so hero strength is never counted twice. */
  heroEdge(heroId: number): number {
    return logit(shrunk(this.hero.get(heroId), this.baseRate, MODEL.kHero)) - logit(this.baseRate);
  }

  /**
   * Baseline is the *sum* of the two hero edges, not their average: a pair's win rate is a team win
   * rate carrying both contributions, so averaging removes only half and leaves the rest in here.
   */
  synergyEdge(a: number, b: number): number {
    const pair = logit(shrunk(this.pairSample(a, b), this.baseRate, MODEL.kPair)) - logit(this.baseRate);
    return pair - (this.heroEdge(a) + this.heroEdge(b));
  }

  /** Worth of the matchup once *both* heroes' own strength is taken out. */
  counterMatchupEdge(hero: number, enemy: number): number {
    const cell = logit(shrunk(this.counterSample(hero, enemy), this.baseRate, MODEL.kCounter)) - logit(this.baseRate);
    return cell - (this.heroEdge(hero) - this.heroEdge(enemy));
  }

  laneDuelEdge(hero: number, enemy: number): number {
    return logit(shrunk(this.laneCounterSample(hero, enemy), 0.5, MODEL.kLaneDuel));
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

  heroWinRate(heroId: number): number | undefined {
    return rate(this.hero.get(heroId));
  }

  /** Points of win rate the hero carries on its own, relative to a coin flip. */
  soloEdge(heroId: number): number | undefined {
    return toPoints(this.heroWinRate(heroId));
  }

  /** The win rate a pair would post on its two heroes' strength alone. */
  expectedApart(a: number, b: number): number | undefined {
    if (this.hero.get(a) === undefined || this.hero.get(b) === undefined) return undefined;
    return sigmoid(logit(this.baseRate) + this.heroEdge(a) + this.heroEdge(b));
  }

  /** Points the pair wins above what its two heroes bring on their own. */
  synergyDelta(a: number, b: number): number | undefined {
    if (this.pairSample(a, b) === undefined) return undefined;
    return POINTS_PER_LOG_ODDS * this.synergyEdge(a, b);
  }

  /** Points the matchup is worth once both heroes' own strength is out of it. */
  counterEdge(hero: number, enemy: number): number | undefined {
    if (this.counterSample(hero, enemy) === undefined) return undefined;
    return POINTS_PER_LOG_ODDS * this.counterMatchupEdge(hero, enemy);
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
  /** Same-lane hero-versus-hero cells, ally rows by enemy columns. */
  duel: MatchupCell[][];
}

export interface Contribution {
  key: "lanes" | "synergy" | "counters" | "solo";
  label: string;
  /** Win-rate points this term adds to the prediction. */
  value: number | undefined;
  /**
   * The same term measured for one side on its own. These do not always net out to `value`: the
   * counter term is read from the ally direction alone, because both directions cover the same
   * matchups and subtracting one from the other would count every one of them twice.
   */
  ally: number | undefined;
  enemy: number | undefined;
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
  enemyPairs: PairRow[];
  counterMatrix: MatchupCell[][];
  lanes: LaneRow[];
}

/**
 * A shrunk rate on `n` matches behaves like one measured over `n + k`, so its log-odds variance is
 * about `4/(n + k)` near an even split; averaging divides that by the cell count squared.
 */
function predictionMargin(termSamples: number[][], shrinkage: number[], logOdds: number): number | undefined {
  let variance = 0;
  let known = false;
  termSamples.forEach((samples, i) => {
    if (samples.length === 0) return;
    known = true;
    const cellVariance = samples.reduce((sum, n) => sum + 4 / (n + shrinkage[i]), 0) / samples.length ** 2;
    variance += MODEL.weights[i] ** 2 * cellVariance;
  });
  if (!known) return undefined;
  const p = sigmoid(logOdds);
  return 100 * 1.96 * Math.sqrt(variance) * p * (1 - p);
}

/**
 * The four model terms for a draft, in win-rate points. Kept separate from `analyzeDraft` so a
 * hypothetical swap can be scored through the identical path rather than an approximation of it.
 */
function draftTerms(draft: Draft, index: StatsIndex) {
  const allyHeroes = filled(draft.ally);
  const enemyHeroes = filled(draft.enemy);

  const soloAlly = mean(allyHeroes.map((h) => index.heroEdge(h)));
  const soloEnemy = mean(enemyHeroes.map((h) => index.heroEdge(h)));
  const solo = (soloAlly ?? 0) - (soloEnemy ?? 0);

  const synergyAlly = mean(unorderedPairs(allyHeroes).map(([a, b]) => index.synergyEdge(a, b)));
  const synergyEnemy = mean(unorderedPairs(enemyHeroes).map(([a, b]) => index.synergyEdge(a, b)));
  const synergy = (synergyAlly ?? 0) - (synergyEnemy ?? 0);

  const counters =
    mean(allyHeroes.flatMap((hero) => enemyHeroes.map((enemy) => index.counterMatchupEdge(hero, enemy)))) ?? 0;
  const lanes = mean(laneDuelEdges(draft, index)) ?? 0;

  // Only the per-side halves already computed here: this runs once per candidate in the swap
  // search, so nothing is derived for the breakdown panel that the prediction does not need.
  return {
    solo,
    synergy,
    counters,
    lanes,
    soloAlly,
    soloEnemy,
    synergyAlly,
    synergyEnemy,
    empty: !allyHeroes.length && !enemyHeroes.length,
  };
}

/** Each term with its overlap with the earlier ones removed. */
function residualTerms(terms: ReturnType<typeof draftTerms>): number[] {
  const raw = [terms.solo, terms.synergy, terms.counters, terms.lanes];
  const out: number[] = [];
  raw.forEach((value, i) => {
    out.push(MODEL.residual[i].reduce((sum, coefficient, j) => sum + coefficient * out[j], value));
  });
  return out;
}

/** Log-odds the ally side wins. */
function draftLogOdds(terms: ReturnType<typeof draftTerms>): number {
  return residualTerms(terms).reduce((sum, value, i) => sum + MODEL.weights[i] * value, MODEL.intercept);
}

function predictedFrom(terms: ReturnType<typeof draftTerms>) {
  return terms.empty ? undefined : 100 * sigmoid(draftLogOdds(terms));
}

/** Predicted ally win rate for a draft, in percent. */
function predictDraft(draft: Draft, index: StatsIndex): number | undefined {
  if (!index.hasData) return undefined;
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

/**
 * The duo-versus-duo endpoint is deliberately not read here even though the lane cards show it: a
 * specific two against a specific two holds only a handful of games and earned no weight in the fit.
 */
function laneDuelEdges(draft: Draft, index: StatsIndex): (number | undefined)[] {
  return LANES.map((_, laneIndex) => {
    const ally = duoOf(draft.ally, laneIndex);
    const enemy = duoOf(draft.enemy, laneIndex);
    return mean(ally.flatMap((hero) => enemy.map((enemyHero) => index.laneDuelEdge(hero, enemyHero))));
  });
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
  const terms = draftTerms(draft, index);
  const residual = residualTerms(terms);

  const minOf = (values: number[]) => (values.length ? Math.min(...values) : 0);
  const pairMatches = [...allyPairs, ...enemyPairs].map((p) => p.matches);
  const counterMatches = counterMatrix.flat().map((c) => c.matches);
  const heroMatches = [...allyHeroes, ...enemyHeroes].map((h) => index.heroSample(h)?.matches ?? 0);
  const duelMatches = lanes.flatMap((l) => l.duel.flat().map((cell) => cell.matches));

  // Read off a fixed slope rather than the draft's own, so the four rows stay on one scale
  // instead of shrinking together as the prediction gets lopsided.
  const points = (value: number, i: number) => POINTS_PER_LOG_ODDS * MODEL.weights[i] * value;
  const half = (value: number | undefined, i: number) =>
    value === undefined ? undefined : POINTS_PER_LOG_ODDS * MODEL.weights[i] * value;

  const contributions: Contribution[] = [
    {
      key: "solo",
      label: "Solo win rates",
      value: points(residual[0], 0),
      ally: half(terms.soloAlly, 0),
      enemy: half(terms.soloEnemy, 0),
      matches: minOf(heroMatches),
    },
    {
      key: "synergy",
      label: "Pair synergy",
      value: points(residual[1], 1),
      ally: half(terms.synergyAlly, 1),
      enemy: half(terms.synergyEnemy, 1),
      matches: minOf(pairMatches),
    },
    {
      key: "counters",
      label: "Counter picks",
      value: points(residual[2], 2),
      // Both heroes' strength is already out of this term, so the enemy view is an exact mirror.
      ally: points(residual[2], 2),
      enemy: -points(residual[2], 2),
      matches: minOf(counterMatches),
    },
    {
      key: "lanes",
      label: "Lane matchups",
      value: points(residual[3], 3),
      ally: points(residual[3], 3),
      enemy: -points(residual[3], 3),
      matches: minOf(duelMatches),
    },
  ];

  return {
    allyHeroes,
    enemyHeroes,
    predicted: index.hasData ? predictedFrom(terms) : undefined,
    margin: predictionMargin(
      [heroMatches, pairMatches, counterMatches, duelMatches],
      [MODEL.kHero, MODEL.kPair, MODEL.kCounter, MODEL.kLaneDuel],
      draftLogOdds(terms),
    ),
    contributions,
    allyPairs,
    enemyPairs,
    counterMatrix,
    lanes,
  };
}

/**
 * The same matchups read from the other side. Each edge is measured against its own hero's baseline,
 * so the two directions are separate lookups and not sign flips of one another. Only the win rate is
 * a true complement.
 */
export function transposeMatchups(matrix: MatchupCell[][], index: StatsIndex): MatchupCell[][] {
  return (matrix[0] ?? []).map((_, column) =>
    matrix.map((row) => {
      const cell = row[column];
      return {
        hero: cell.enemy,
        enemy: cell.hero,
        edge: index.counterEdge(cell.enemy, cell.hero),
        winRate: cell.winRate === undefined ? undefined : 1 - cell.winRate,
        matches: cell.matches,
      };
    }),
  );
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
export function recommendPicks(draft: Draft, index: StatsIndex, side: Side, candidates: number[]): Recommendation[] {
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
      // Weighted like the prediction, so this order agrees with the gains the swap chips quote.
      const score =
        MODEL.weights[0] * (index.heroEdge(heroId) * POINTS_PER_LOG_ODDS) +
        MODEL.weights[1] * (synergy ?? 0) +
        MODEL.weights[2] * (counter ?? 0);
      return {
        heroId,
        synergy,
        counter,
        solo,
        winRate: index.heroWinRate(heroId),
        matches: sample?.matches ?? 0,
        score,
      };
    })
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
function searchSwaps(draft: Draft, index: StatsIndex, side: Side, candidates: number[]): Swap[] {
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

  const found: Swap[] = [];
  draft[side].forEach((out, slot) => {
    if (out === null) return;
    for (const candidate of candidates) {
      if (drafted.has(candidate)) continue;
      hypothetical[side][slot] = candidate;
      const predicted = predictDraft(hypothetical, index);
      if (predicted === undefined) continue;
      const gain = (predicted - baseline) * sign;
      if (gain >= MIN_GAIN) found.push({ slot, out, in: candidate, gain });
    }
    hypothetical[side][slot] = out;
  });

  return found;
}

/**
 * Every worthwhile replacement across the side, sorted by gain — so a caller wanting one row per
 * slot can take the first it sees for each. Scored by re-predicting the draft, so the numbers match
 * the board's own chips; ranking by `recommendPicks` would quote a gain the swap does not deliver.
 */
export function rankSwaps(draft: Draft, index: StatsIndex, side: Side, candidates: number[]): Swap[] {
  return searchSwaps(draft, index, side, candidates).sort((a, b) => b.gain - a.gain);
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
