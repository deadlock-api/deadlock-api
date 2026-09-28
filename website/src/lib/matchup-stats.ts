interface WinRecord {
  wins: number;
  matches: number;
}

/** Difference in win probability; allies use the mean of both heroes' baselines. */
export function matchupWinRateChange(
  wins: number,
  matches: number,
  baselines: (WinRecord | undefined)[],
): number | undefined {
  const valid = (record: WinRecord | undefined): record is WinRecord =>
    record !== undefined &&
    Number.isFinite(record.matches) &&
    Number.isFinite(record.wins) &&
    record.matches > 0 &&
    record.wins >= 0 &&
    record.wins <= record.matches;

  if (!valid({ wins, matches }) || baselines.length === 0 || !baselines.every(valid)) return undefined;
  return wins / matches - baselines.reduce((sum, hero) => sum + hero.wins / hero.matches, 0) / baselines.length;
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
    const relWinrate = matchupWinRateChange(synergy.wins, synergy.matches_played, [
      baselines.get(heroId),
      baselines.get(other),
    ]);
    if (relWinrate === undefined) continue;
    synergies.set(other, { heroId: other, matches: synergy.matches_played, wins: synergy.wins, relWinrate });
  }
  const counters = new Map<number, MatchupRow>();
  for (const counter of period.counters) {
    if (counter.hero_id !== heroId) continue;
    const relWinrate = matchupWinRateChange(counter.wins, counter.matches_played, [baselines.get(heroId)]);
    if (relWinrate === undefined) continue;
    const other = counter.enemy_hero_id;
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
