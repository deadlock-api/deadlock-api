import type { PlayerMatchHistoryEntry } from "deadlock_api_client";

import type { MatchTally } from "./companions";
import { type PlayerResult, playerResult, winRateOf } from "./compute";
import { TEAMS } from "./teams";

/** The heroes of one match by team index (0 = Team0), the tracked player's hero included. */
export type MatchTeams = [number[], number[]];

/** Matches per match-heroes request: up to 12 players each (13 with a re-ingested duplicate) under GraphQL's 10,000 rows. */
export const MATCH_HEROES_CHUNK = 750;

/** One stored player row of a match, as `match_players` returns it. */
export interface MatchHeroRow {
  match_id?: number | null;
  team?: string | null;
  hero_id?: number | null;
}

/** Groups player rows into each match's two teams; a re-ingested duplicate row counts once. */
export function teamsByMatch(rows: readonly MatchHeroRow[]): Record<number, MatchTeams> {
  const teams: Record<number, MatchTeams> = {};
  for (const row of rows) {
    const teamIndex = TEAMS.findIndex((team) => team.key === row.team);
    if (row.match_id == null || row.hero_id == null || row.hero_id === 0 || teamIndex === -1) continue;
    const match = (teams[row.match_id] ??= [[], []]);
    if (!match[teamIndex].includes(row.hero_id)) match[teamIndex].push(row.hero_id);
  }
  return teams;
}

export interface HeroMatchupRow {
  heroId: number;
  /** Matches with the hero on the tracked player's team, played by someone else. */
  with: MatchTally;
  /** Matches with the hero on the other team. */
  against: MatchTally;
}

const emptyTally = (): MatchTally => ({ matches: 0, wins: 0, losses: 0, matchIds: [] });

function count(tally: MatchTally, matchId: number, result: PlayerResult) {
  tally.matches += 1;
  if (result === "win") tally.wins += 1;
  else if (result === "loss") tally.losses += 1;
  tally.matchIds.push(matchId);
}

/**
 * The tracked player's results with and against every other hero, over the filtered matches whose players are stored.
 * `matches`, `wins` and `losses` are the tracked player's over those matches, the baseline each hero's win rate
 * compares with.
 */
export function computeHeroMatchups(
  entries: readonly PlayerMatchHistoryEntry[],
  teams: Readonly<Record<number, MatchTeams>>,
): { rows: HeroMatchupRow[]; matches: number; wins: number; losses: number } {
  const byHero = new Map<number, HeroMatchupRow>();
  const rowOf = (heroId: number) => {
    let row = byHero.get(heroId);
    if (!row) {
      row = { heroId, with: emptyTally(), against: emptyTally() };
      byHero.set(heroId, row);
    }
    return row;
  };
  let matches = 0;
  let wins = 0;
  let losses = 0;
  for (const entry of entries) {
    const match = teams[entry.match_id];
    const own = match?.[entry.player_team];
    const enemy = match?.[1 - entry.player_team];
    if (!own || !enemy) continue;
    matches += 1;
    const result = playerResult(entry);
    if (result === "win") wins += 1;
    else if (result === "loss") losses += 1;
    for (const heroId of own) if (heroId !== entry.hero_id) count(rowOf(heroId).with, entry.match_id, result);
    for (const heroId of enemy) count(rowOf(heroId).against, entry.match_id, result);
  }
  return { rows: [...byHero.values()].sort((a, b) => a.heroId - b.heroId), matches, wins, losses };
}

/** The fewest games a hero needs for its win rate to rank in the overview: 2% of the matches, at least 3. */
export function rankingMinimum(matches: number): number {
  return Math.max(3, Math.ceil(matches * 0.02));
}

/**
 * The `limit` heroes with the highest (`best`) or lowest win rate on one side, among those with at least `minimum`
 * scored games there; more games break a tie.
 */
export function rankHeroes(
  rows: readonly HeroMatchupRow[],
  side: "with" | "against",
  order: "best" | "worst",
  minimum: number,
  limit: number,
): HeroMatchupRow[] {
  const rate = (row: HeroMatchupRow) => winRateOf(row[side]) ?? 0;
  return rows
    .filter((row) => row[side].wins + row[side].losses >= minimum)
    .sort(
      (a, b) =>
        (order === "best" ? rate(b) - rate(a) : rate(a) - rate(b)) ||
        b[side].matches - a[side].matches ||
        a.heroId - b.heroId,
    )
    .slice(0, limit);
}

/**
 * Whether a win rate over `tally` differs from `baseline` by more than chance would explain, at 95% (the normal
 * approximation of the binomial around the baseline).
 */
export function differsFromBaseline(tally: MatchTally, baseline: number): boolean {
  const rate = winRateOf(tally);
  if (rate === null) return false;
  const standardError = Math.sqrt((baseline * (1 - baseline)) / (tally.wins + tally.losses));
  return Math.abs(rate - baseline) > 1.96 * standardError;
}
