import type { HashMapValue } from "deadlock_api_client";

/** One player's match as `/v1/analytics/player-stats/metrics` reads it, named like its columns. */
export interface PlayerMetricRow {
  kills: number;
  deaths: number;
  assists: number;
  net_worth: number;
  denies: number;
  last_hits: number;
  max_hero_bullets_hit_crit: number;
  max_hero_bullets_hit: number;
  max_shots_hit: number;
  max_shots_missed: number;
  max_player_damage: number;
  max_player_damage_taken: number;
  max_boss_damage: number;
  max_player_healing: number;
  duration_s: number;
}

interface PlayerMetricFormula {
  /** The SQL it ports, as in `Metric::get_select_clause`. */
  sql: string;
  value: (row: PlayerMetricRow) => number;
}

const durationM = (row: PlayerMetricRow) => Math.max(1, row.duration_s) / 60;

/**
 * The per-match values of the API's player-stats metrics, ported from `Metric::get_select_clause` in
 * `api-crates/api/src/routes/v1/analytics/player_stats_metrics.rs` for the tracker demo, whose account the API does not know.
 * Each keeps the SQL it ports, and `player-metric-formulas.test.ts` fails when the Rust one changes. The metrics over
 * columns the demo does not generate (neutral damage, max health, self and teammate healing, barriers, heal prevented,
 * buffs) and the deprecated aliases are left out.
 */
export const PLAYER_METRIC_FORMULAS: Record<string, PlayerMetricFormula> = {
  kills: { sql: "kills", value: (row) => row.kills },
  deaths: { sql: "deaths", value: (row) => row.deaths },
  assists: { sql: "assists", value: (row) => row.assists },
  net_worth: { sql: "net_worth", value: (row) => row.net_worth },
  net_worth_per_min: { sql: "net_worth / duration_m", value: (row) => row.net_worth / durationM(row) },
  denies: { sql: "denies", value: (row) => row.denies },
  last_hits: { sql: "last_hits", value: (row) => row.last_hits },
  crit_shot_rate: {
    sql: "max_hero_bullets_hit_crit / greatest(1, max_hero_bullets_hit)",
    value: (row) => row.max_hero_bullets_hit_crit / Math.max(1, row.max_hero_bullets_hit),
  },
  accuracy: {
    sql: "max_shots_hit / greatest(1, max_shots_hit + max_shots_missed)",
    value: (row) => row.max_shots_hit / Math.max(1, row.max_shots_hit + row.max_shots_missed),
  },
  kd: { sql: "kills / greatest(1, deaths)", value: (row) => row.kills / Math.max(1, row.deaths) },
  kda: {
    sql: "(kills + assists) / greatest(1, deaths)",
    value: (row) => (row.kills + row.assists) / Math.max(1, row.deaths),
  },
  kills_plus_assists: { sql: "kills + assists", value: (row) => row.kills + row.assists },
  player_damage: { sql: "max_player_damage", value: (row) => row.max_player_damage },
  player_damage_per_min: {
    sql: "max_player_damage / duration_m",
    value: (row) => row.max_player_damage / durationM(row),
  },
  player_damage_taken_per_min: {
    sql: "max_player_damage_taken / duration_m",
    value: (row) => row.max_player_damage_taken / durationM(row),
  },
  boss_damage: { sql: "max_boss_damage", value: (row) => row.max_boss_damage },
  boss_damage_per_min: { sql: "max_boss_damage / duration_m", value: (row) => row.max_boss_damage / durationM(row) },
  player_healing: { sql: "max_player_healing", value: (row) => row.max_player_healing },
  player_healing_per_min: {
    sql: "max_player_healing / duration_m",
    value: (row) => row.max_player_healing / durationM(row),
  },
};

const PERCENTILES = [1, 5, 10, 25, 50, 75, 90, 95, 99] as const;

/** The value below which `p` percent of the sorted values lie, interpolated between neighbours. */
function percentile(sorted: readonly number[], p: number): number {
  const position = (p / 100) * (sorted.length - 1);
  const below = Math.floor(position);
  const above = Math.min(below + 1, sorted.length - 1);
  return sorted[below] + (sorted[above] - sorted[below]) * (position - below);
}

/**
 * The metrics the API would return for these matches: over single matches, `std` the population deviation as
 * ClickHouse's `std`. The API's percentiles are DDSketch estimates within 1%; these are exact. No matches, no metrics.
 */
export function playerMetricsOf(rows: readonly PlayerMetricRow[]): Record<string, HashMapValue> {
  if (rows.length === 0) return {};
  return Object.fromEntries(
    Object.entries(PLAYER_METRIC_FORMULAS).map(([key, formula]) => {
      const values = rows.map(formula.value).toSorted((a, b) => a - b);
      const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
      const std = Math.sqrt(values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length);
      const percentiles = Object.fromEntries(PERCENTILES.map((p) => [`percentile${p}`, percentile(values, p)]));
      return [key, { avg, std, ...percentiles } as HashMapValue];
    }),
  );
}
