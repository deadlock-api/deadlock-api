import { shrunkWinRate } from "~/lib/shrinkage";

interface WinRecord {
  wins: number;
  matches: number;
}

/** Matches at the expected rate added to every sample, so a pairing seen a few times reads as no effect. */
const PRIOR_MATCHES = 100;

const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

const validRecord = (record: WinRecord | undefined): record is WinRecord =>
  record !== undefined &&
  Number.isFinite(record.matches) &&
  Number.isFinite(record.wins) &&
  record.matches > 0 &&
  record.wins >= 0 &&
  record.wins <= record.matches;

/**
 * The win rate two records' own strength predicts for their pairing: both shrunk toward 50%, then added in log-odds for
 * an ally (a teammate, or an item the hero buys) or the other's taken from the hero's for an enemy. Undefined when a
 * record is missing or impossible.
 */
export function expectedPairingWinRate(
  hero: WinRecord | undefined,
  other: WinRecord | undefined,
  side: "ally" | "enemy",
): number | undefined {
  if (!validRecord(hero) || !validRecord(other)) return undefined;
  const strength = (record: WinRecord) => logit(shrunkWinRate(record.wins, record.matches, PRIOR_MATCHES));
  return sigmoid(strength(hero) + (side === "ally" ? 1 : -1) * strength(other));
}

/**
 * How far a pairing's win rate sits from what the two heroes' own strength predicts, in win probability.
 *
 * The prediction adds the heroes' strength in log-odds: a teammate's to the hero's, an enemy's taken from it. Comparing
 * with the hero's own rate alone would make every strong enemy look like a counter, and the mean of two teammates'
 * rates leaves half of their combined strength in the change. The pairing's rate is shrunk toward the prediction, and
 * both heroes' rates toward 50%, so thin samples move little.
 */
export function matchupWinRateChange(
  wins: number,
  matches: number,
  hero: WinRecord | undefined,
  other: WinRecord | undefined,
  side: "ally" | "enemy",
): number | undefined {
  const expected = expectedPairingWinRate(hero, other, side);
  if (!validRecord({ wins, matches }) || expected === undefined) return undefined;
  return shrunkWinRate(wins, matches, PRIOR_MATCHES, expected) - expected;
}

export interface MatchupRow {
  heroId: number;
  matches: number;
  wins: number;
  relWinrate: number;
  /** The same change over the previous period, when that period had the pairing. */
  prevRelWinrate?: number;
}

/** One period of the analytics responses a hero's matchups are computed from. */
export interface MatchupPeriod {
  heroStats: readonly { hero_id: number; wins: number; matches: number }[];
  synergies: readonly { hero_id1: number; hero_id2: number; wins: number; matches_played: number }[];
  counters: readonly { hero_id: number; enemy_hero_id: number; wins: number; matches_played: number }[];
}

/** A hero's teammates and opponents, each sorted from the biggest win rate gain to the biggest loss. */
export interface HeroMatchups {
  synergyRows: MatchupRow[];
  counterRows: MatchupRow[];
}

function periodRows(heroId: number, period: MatchupPeriod) {
  const baselines = new Map(period.heroStats.map((hero) => [hero.hero_id, hero]));
  const synergies = new Map<number, MatchupRow>();
  for (const synergy of period.synergies) {
    if (synergy.hero_id1 !== heroId && synergy.hero_id2 !== heroId) continue;
    const other = synergy.hero_id1 === heroId ? synergy.hero_id2 : synergy.hero_id1;
    const relWinrate = matchupWinRateChange(
      synergy.wins,
      synergy.matches_played,
      baselines.get(heroId),
      baselines.get(other),
      "ally",
    );
    if (relWinrate === undefined) continue;
    synergies.set(other, { heroId: other, matches: synergy.matches_played, wins: synergy.wins, relWinrate });
  }
  const counters = new Map<number, MatchupRow>();
  for (const counter of period.counters) {
    if (counter.hero_id !== heroId) continue;
    const other = counter.enemy_hero_id;
    const relWinrate = matchupWinRateChange(
      counter.wins,
      counter.matches_played,
      baselines.get(heroId),
      baselines.get(other),
      "enemy",
    );
    if (relWinrate === undefined) continue;
    counters.set(other, { heroId: other, matches: counter.matches_played, wins: counter.wins, relWinrate });
  }
  return { synergies, counters };
}

export function heroMatchups(heroId: number, current: MatchupPeriod, previous?: MatchupPeriod): HeroMatchups {
  const now = periodRows(heroId, current);
  const before = previous ? periodRows(heroId, previous) : undefined;
  const withPrevious = (rows: Map<number, MatchupRow>, prev: Map<number, MatchupRow> | undefined) =>
    [...rows.values()]
      .map((row) => {
        // The rows are this call's own objects, so annotating them in place is safe.
        const prevRelWinrate = prev?.get(row.heroId)?.relWinrate;
        if (prevRelWinrate !== undefined) row.prevRelWinrate = prevRelWinrate;
        return row;
      })
      .sort((a, b) => b.relWinrate - a.relWinrate);
  return {
    synergyRows: withPrevious(now.synergies, before?.synergies),
    counterRows: withPrevious(now.counters, before?.counters),
  };
}
