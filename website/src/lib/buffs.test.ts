import assert from "node:assert/strict";
import { test } from "node:test";

import type { AnalyticsBuffStats, MiscEntity } from "deadlock_api_client";

import {
  buffInfoByType,
  buffMatchBase,
  isBuffAddedWithTimings,
  formatBuffValue,
  parseBuffType,
  summarizeBuffStats,
} from "./buffs";

function row(buffType: string, fields: Partial<AnalyticsBuffStats> = {}): AnalyticsBuffStats {
  return {
    buff_type: buffType,
    is_permanent: true,
    matches: 100,
    matches_with_pickup: 50,
    pickups: 80,
    timed_matches: 10,
    timed_pickups: 8,
    total_stat_value: 24,
    ...fields,
  };
}

test("a buff type splits into its stat and level", () => {
  assert.deepEqual(parseBuffType("spirit_permanent_pickup_lv2"), { stat: "spirit_permanent_pickup", level: 2 });
  assert.deepEqual(parseBuffType("spirit_permanent_pickup"), { stat: "spirit_permanent_pickup", level: 1 });
});

test("buff values print in their unit, move speed in meters", () => {
  assert.equal(formatBuffValue(3.937, "Meters"), "0.1 m");
  assert.equal(formatBuffValue(1.5, "Percent"), "1.5%");
  assert.equal(formatBuffValue(117.4, null), "117");
});

test("buffs group by stat, drop unpicked levels and temporary power-ups", () => {
  const info = buffInfoByType([
    {
      id: 1,
      class_name: "hp_permanent_pickup",
      name: "+15 Bonus Health",
      buff_type_name: "Bonus Health",
      buff_type_graph_color: { red: 150, green: 240, blue: 60, alpha: 255 },
    },
  ] as MiscEntity[]);
  const summary = summarizeBuffStats(
    [
      row("hp_permanent_pickup_lv2"),
      row("hp_permanent_pickup"),
      row("range_permanent_pickup", { pickups: 0 }),
      row("gun_powerup_pickup", { is_permanent: false }),
      row("ammo_permanent_pickup", { timed_matches: 0, pickups: 10 }),
    ],
    info,
  );
  assert.deepEqual(
    summary.map((s) => s.stat),
    ["hp_permanent_pickup", "ammo_permanent_pickup"],
  );
  const [hp, ammo] = summary;
  assert.equal(hp.name, "Bonus Health");
  assert.equal(hp.color, "rgb(150, 240, 60)");
  assert.equal(hp.pickupsPerMatch, 1.6);
  assert.equal(hp.valuePerMatch, 4.8);
  assert.deepEqual(
    hp.levels.map((l) => l.buff_type),
    ["hp_permanent_pickup", "hp_permanent_pickup_lv2"],
  );
  assert.equal(ammo.name, "Ammo");
  assert.equal(ammo.valuePerMatch, null);
});

test("a buff the update added is rated over the matches since it, not diluted by older ones", () => {
  const added = row("movespeed_permanent_pickup", { pickups: 5, timed_pickups: 5 });
  assert.equal(isBuffAddedWithTimings(added), true);
  assert.equal(buffMatchBase(added), 10);
  assert.equal(isBuffAddedWithTimings(row("hp_permanent_pickup")), false);
  const [summary] = summarizeBuffStats([added], new Map());
  assert.equal(summary.pickupsPerMatch, 0.5);
});
