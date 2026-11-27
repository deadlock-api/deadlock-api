import assert from "node:assert/strict";
import { test } from "node:test";

import {
  bestWinRateHero,
  chronotype,
  dailyActivity,
  damageSplit,
  dayIndex,
  mergeDamageSources,
  monthGrid,
  monthlyRecord,
  soulSources,
  summarizeDays,
  timeComparison,
  utcParts,
  weaponCodename,
} from "./recap";
import type { RecapHero, RecapMatch, RecapTotals } from "./types";

const unix = (iso: string) => Date.parse(iso) / 1000;
const match = (iso: string, won = true): RecapMatch => ({
  match_id: unix(iso),
  start_time: unix(iso),
  duration_s: 1800,
  game_mode: "normal",
  match_mode: "unranked",
  hero_id: 1,
  won,
});

test("days count and streaks follow the calendar", () => {
  const matches = [
    match("2026-03-01T10:00:00Z"),
    match("2026-03-02T10:00:00Z", false),
    match("2026-03-02T18:00:00Z"),
    match("2026-03-03T10:00:00Z"),
    match("2026-03-10T10:00:00Z"),
  ];
  const days = dailyActivity(matches, 2026, utcParts);
  assert.equal(days.length, 365);
  const summary = summarizeDays(2026, days);
  assert.equal(summary.activeDays, 4);
  assert.equal(summary.busiest?.month, 2);
  assert.equal(summary.busiest?.day, 2);
  assert.equal(summary.busiest?.matches, 2);
  assert.equal(summary.longestStreak?.length, 3);
  assert.equal(summary.longestStreak?.from.day, 1);
  assert.equal(summary.longestStreak?.to.day, 3);
  // 2026-03-02 is a Monday.
  assert.deepEqual(summary.favoriteWeekday, { weekday: 0, matches: 2 });
});

test("a match in another year in the visitor's zone leaves the calendar", () => {
  const days = dailyActivity([match("2025-12-31T23:30:00Z")], 2026, utcParts);
  assert.equal(
    days.reduce((sum, day) => sum + day.matches, 0),
    0,
  );
  assert.equal(summarizeDays(2026, days).longestStreak, null);
});

test("month grids start on the right weekday", () => {
  // 1 January 2026 is a Thursday, 1 February a Sunday.
  assert.deepEqual(monthGrid(2026, 0), { offset: 3, days: 31 });
  assert.deepEqual(monthGrid(2026, 1), { offset: 6, days: 28 });
  assert.equal(dayIndex(2026, 11, 31), 364);
});

test("monthly records split wins and losses", () => {
  const months = monthlyRecord(
    [match("2026-01-05T00:00:00Z"), match("2026-01-06T00:00:00Z", false), match("2026-12-31T00:00:00Z")],
    2026,
    utcParts,
  );
  assert.deepEqual(months[0], { month: 0, wins: 1, losses: 1 });
  assert.deepEqual(months[11], { month: 11, wins: 1, losses: 0 });
});

test("chronotype reads where matches start", () => {
  const hours = Array.from({ length: 24 }, () => 0);
  assert.equal(chronotype(hours), null);
  hours[2] = 3;
  hours[20] = 5;
  assert.equal(chronotype(hours)?.type, "night-owl");
  hours[2] = 0;
  assert.equal(chronotype(hours)?.type, "after-work");
});

test("crit damage folds into its weapon", () => {
  const merged = mergeDamageSources([
    { source: "upgrade_magic_shock", damage: 900, matches: 4 },
    { source: "citadel_weapon_fencer_set", damage: 700, matches: 2 },
    { source: "citadel_weapon_fencer_set_crit", damage: 300, matches: 2 },
  ]);
  assert.deepEqual(merged[0], { source: "citadel_weapon_fencer_set", kind: "weapon", damage: 1000, matches: 2 });
  assert.equal(merged[1]?.kind, "item");
  assert.equal(weaponCodename("citadel_weapon_bookworm_set2"), "bookworm");
});

const totals = (patch: Partial<RecapTotals>) => ({ dm_bullet: 0, dm_ability: 0, dm_melee: 0, ...patch }) as RecapTotals;

test("damage style comes from the player's own split", () => {
  assert.equal(damageSplit(totals({})), null);
  assert.equal(damageSplit(totals({ dm_bullet: 70, dm_ability: 30 }))?.style, "gunslinger");
  assert.equal(damageSplit(totals({ dm_bullet: 20, dm_ability: 80 }))?.style, "spirit");
  assert.equal(damageSplit(totals({ dm_bullet: 40, dm_ability: 30, dm_melee: 30 }))?.style, "brawler");
  assert.equal(damageSplit(totals({ dm_bullet: 50, dm_ability: 50 }))?.style, "hybrid");
});

test("a best hero needs enough matches", () => {
  const hero = (hero_id: number, matches: number, wins: number) => ({ hero_id, matches, wins }) as RecapHero;
  assert.equal(bestWinRateHero([hero(1, 9, 9), hero(2, 20, 12), hero(3, 30, 15)])?.hero_id, 2);
  assert.equal(bestWinRateHero([hero(1, 9, 9)]), null);
});

test("soul sources skip what was not recorded", () => {
  const sources = soulSources({
    gold_players: 10,
    gold_lane_creeps: 30,
    gold_neutrals: 0,
    gold_bosses: 5,
    gold_treasure: 0,
    gold_breakables: 0,
  } as RecapTotals);
  assert.deepEqual(
    sources.map((source) => source.key),
    ["gold_lane_creeps", "gold_players", "gold_bosses"],
  );
});

test("time compares in the biggest unit that fits", () => {
  assert.equal(timeComparison(4_872_797).unit, "days of nonstop Deadlock");
  assert.equal(Math.round(timeComparison(4_872_797).count), 56);
  assert.equal(timeComparison(50_000).unit, "extended Lord of the Rings marathons");
  assert.equal(timeComparison(3 * 3600).unit, "feature films");
  assert.equal(timeComparison(600).unit, "minutes");
});
