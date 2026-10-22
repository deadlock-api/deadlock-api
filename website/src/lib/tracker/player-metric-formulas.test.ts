import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { PLAYER_METRIC_FORMULAS, type PlayerMetricRow, playerMetricsOf } from "./player-metric-formulas";

const RUST = new URL("../../../../api/src/routes/v1/analytics/player_stats_metrics.rs", import.meta.url);

/** `Metric::get_select_clause`'s SQL per metric key, from the Rust source. */
function rustFormulas(): Map<string, string> {
  const source = readFileSync(RUST, "utf8");
  const body = source.slice(source.indexOf("fn get_select_clause"), source.indexOf("fn is_buff"));
  const formulas = new Map<string, string>();
  for (const [, variants, sql] of body.matchAll(/((?:Self::\w+(?:\s*\|\s*)?)+)\s*=>\s*"([^"]+)"/g)) {
    for (const [, variant] of variants.matchAll(/Self::(\w+)/g)) {
      formulas.set(variant.replace(/(?<!^)([A-Z])/g, "_$1").toLowerCase(), sql);
    }
  }
  return formulas;
}

test("every ported formula still matches the API's SQL", () => {
  const rust = rustFormulas();
  assert.ok(rust.size > 20, "parsed the Rust formulas");
  for (const [key, formula] of Object.entries(PLAYER_METRIC_FORMULAS)) {
    assert.equal(formula.sql, rust.get(key), `${key}: port the changed formula in player-metric-formulas.ts`);
  }
});

const row = (overrides: Partial<PlayerMetricRow>): PlayerMetricRow => ({
  kills: 0,
  deaths: 0,
  assists: 0,
  net_worth: 0,
  denies: 0,
  last_hits: 0,
  max_hero_bullets_hit_crit: 0,
  max_hero_bullets_hit: 0,
  max_shots_hit: 0,
  max_shots_missed: 0,
  max_player_damage: 0,
  max_player_damage_taken: 0,
  max_boss_damage: 0,
  max_player_healing: 0,
  duration_s: 1800,
  ...overrides,
});

test("playerMetricsOf averages per match, with the population deviation and percentiles", () => {
  const metrics = playerMetricsOf([
    row({ kills: 2, deaths: 0, max_player_healing: 3000 }),
    row({ kills: 6, deaths: 2, max_player_healing: 6000, duration_s: 3600 }),
  ]);
  assert.equal(metrics.kills.avg, 4);
  assert.equal(metrics.kills.std, 2);
  assert.equal(metrics.kills.percentile50, 4);
  assert.equal(metrics.kills.percentile1, 2.04);
  // Deaths are floored at 1, as `greatest(1, deaths)`: 2 / 1 and 6 / 2.
  assert.equal(metrics.kd.avg, 2.5);
  // Per minute of each match: 3000 / 30 and 6000 / 60.
  assert.equal(metrics.player_healing_per_min.avg, 100);
  assert.deepEqual(playerMetricsOf([]), {});
});
