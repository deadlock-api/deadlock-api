import assert from "node:assert/strict";
import { test } from "node:test";

import type { HeroStats } from "deadlock_api_client";

import {
  aggregateHeroStats,
  compareColorIndexes,
  compareStatWinners,
  MAX_COMPARE_PLAYERS,
  type PlayerAggregate,
  parseCompareIds,
  rankShareLabel,
  sharedHeroes,
  statTally,
  statWinners,
} from "./player-compare";

function row(overrides: Partial<HeroStats>): HeroStats {
  return {
    account_id: 1,
    hero_id: 1,
    matches_played: 0,
    wins: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    time_played: 0,
    last_played: 0,
    matches: [],
    accuracy: 0,
    crit_shot_rate: 0,
    assists_per_min: 0,
    creeps_per_min: 0,
    damage_mitigated_per_min: 0,
    damage_per_min: 0,
    damage_per_soul: 0,
    damage_taken_per_min: 0,
    damage_taken_per_soul: 0,
    deaths_per_min: 0,
    denies_per_match: 0,
    denies_per_min: 0,
    ending_level: 0,
    kills_per_min: 0,
    last_hits_per_min: 0,
    mvp_rank_counts: [],
    mvp_rated_matches: 0,
    networth_per_min: 0,
    obj_damage_per_min: 0,
    obj_damage_per_soul: 0,
    total_boss_damage: 0,
    total_creep_damage: 0,
    total_neutral_damage: 0,
    total_player_damage: 0,
    total_player_damage_taken: 0,
    ...overrides,
  };
}

test("parseCompareIds keeps valid ids once, in order, capped", () => {
  assert.deepEqual(parseCompareIds([3, 1, 3, -2, 0, 1.5, 2]), [3, 1, 2]);
  assert.deepEqual(parseCompareIds(null), []);
  // Past the 32-bit account id range: the API would reject the whole batch.
  assert.deepEqual(parseCompareIds([2 ** 32, 76561198000000000, 5]), [5]);
  assert.equal(parseCompareIds([1, 2, 3, 4, 5, 6, 7]).length, MAX_COMPARE_PLAYERS);
});

test("aggregateHeroStats weights rates by time and averages by matches", () => {
  const rows = [
    row({
      hero_id: 1,
      matches_played: 1,
      wins: 1,
      kills: 10,
      deaths: 2,
      assists: 4,
      time_played: 600,
      networth_per_min: 1000,
      accuracy: 0.5,
      total_player_damage: 5000,
      mvp_rank_counts: [1, 0, 0],
      mvp_rated_matches: 1,
    }),
    row({
      hero_id: 2,
      matches_played: 3,
      wins: 1,
      kills: 6,
      deaths: 6,
      assists: 12,
      time_played: 1800,
      networth_per_min: 600,
      accuracy: 0.3,
      total_player_damage: 13000,
      mvp_rated_matches: 3,
    }),
    row({ account_id: 2, hero_id: 1, matches_played: 9, wins: 9 }),
  ];
  const aggregate = aggregateHeroStats(rows, 1);
  assert.ok(aggregate);
  assert.equal(aggregate.matches, 4);
  assert.equal(aggregate.winRate, 0.5);
  assert.equal(aggregate.kills, 4);
  assert.equal(aggregate.kda, 32 / 8);
  // 10 minutes at 1000 and 30 at 600.
  assert.equal(aggregate.netWorthPerMin, 700);
  assert.ok(Math.abs(aggregate.accuracy - 0.35) < 1e-9);
  assert.equal(aggregate.mvpRate, 0.25);
  // One MVP finish among four rated matches, and nothing else in the top 3.
  assert.equal(aggregate.top3Rate, 0.25);
  assert.equal(aggregate.heroesPlayed, 2);
  assert.equal(aggregate.avgMatchSeconds, 600);
  // 18,000 damage over 10 min at 1000 souls/min plus 30 min at 600: 28,000 souls.
  assert.ok(Math.abs((aggregate.damagePerSoul ?? 0) - 18000 / 28000) < 1e-9);
  // Loaded outside the hero stats.
  assert.equal(aggregate.rankBadge, undefined);
});

test("aggregateHeroStats is null for a player without matches", () => {
  assert.equal(aggregateHeroStats([row({ account_id: 1, matches_played: 0 })], 1), null);
  assert.equal(aggregateHeroStats([], 1), null);
});

test("statWinners shares ties, honours lower-is-better and skips missing values", () => {
  assert.deepEqual(statWinners([1, 3, 3], "higher"), [1, 2]);
  assert.deepEqual(statWinners([5, 2, null], "lower"), [1]);
  assert.deepEqual(statWinners([null, 4], "higher"), []);
  assert.deepEqual(statWinners([2, 2], "higher"), []);
  assert.deepEqual(statWinners([1, 9], "none"), []);
});

test("statTally counts the stats each player wins", () => {
  const base = aggregateHeroStats([row({ matches_played: 2, wins: 1, kills: 4, deaths: 4, time_played: 1 })], 1)!;
  const better = { ...base, winRate: 0.9, deaths: 1 };
  assert.deepEqual(
    statTally(
      [base, better, null],
      [
        { key: "winRate", label: "", format: "percent", polarity: "higher", group: "Overview" },
        { key: "deaths", label: "", format: "decimal1", polarity: "lower", group: "Overview" },
        { key: "matches", label: "", format: "integer", polarity: "none", group: "Overview" },
      ],
    ),
    [0, 2, 0],
  );
});

test("sharedHeroes keeps heroes two players have in common, most played first", () => {
  const rows = [
    row({ account_id: 1, hero_id: 7, matches_played: 2, wins: 1 }),
    row({ account_id: 2, hero_id: 7, matches_played: 1, wins: 1 }),
    row({ account_id: 1, hero_id: 8, matches_played: 20 }),
    row({ account_id: 1, hero_id: 9, matches_played: 5 }),
    row({ account_id: 3, hero_id: 9, matches_played: 5 }),
    row({ account_id: 4, hero_id: 9, matches_played: 5 }),
  ];
  const shared = sharedHeroes(rows, [1, 2, 3]);
  assert.deepEqual(
    shared.map((entry) => entry.heroId),
    [9, 7],
  );
  assert.equal(shared[1].stats[1]?.winRate, 1);
  assert.equal(shared[0].stats[1], null);
});

test("rankShareLabel names the top or bottom share of the field", () => {
  assert.equal(rankShareLabel(99.6), "Top 1%");
  assert.equal(rankShareLabel(78), "Top 22%");
  assert.equal(rankShareLabel(20), "Bottom 20%");
  assert.equal(rankShareLabel(0), "Bottom 1%");
  // Fewer deaths than 90% of players is the top 10%.
  assert.equal(rankShareLabel(10, true), "Top 10%");
});

test("compareShareParams keeps the comparison and pins the dates", async () => {
  const { compareShareParams } = await import("./compare-share");
  const fromString = compareShareParams("players=1%2C2&hero=15&page=3&sort_by=kills", {
    minUnixTimestamp: 1_764_547_200, // 2025-12-01T00:00:00Z
    maxUnixTimestamp: 1_767_225_599, // 2025-12-31T23:59:59Z
  });
  assert.equal(fromString.get("players"), "1,2");
  assert.equal(fromString.get("hero"), "15");
  assert.equal(fromString.has("page"), false);
  assert.equal(fromString.get("date_range"), "2025-12-01_2025-12-31");
  // A start between day boundaries (a patch release) keeps its instant; an open end is today.
  const [start, end] = compareShareParams("", { minUnixTimestamp: 1_764_615_600 }).get("date_range")!.split("_");
  assert.equal(start, "2025-12-01T19:00:00.000Z");
  assert.equal(end, new Date().toISOString().slice(0, 10));
  // Without a range (the og:image), the URL's dates stay as they are.
  assert.equal(compareShareParams("players=5&date_range=a_").get("date_range"), "a_");
  const fromObject = compareShareParams({ players: 5, date_range: "a_b", tab: "x" });
  assert.equal(fromObject.toString(), "players=5&date_range=a_b");
});

test("compareStatWinners: values printed alike share the win", () => {
  const withValue = (key: "winRate" | "kills", value: number) => ({ [key]: value }) as unknown as PlayerAggregate;
  // 0.1235 and 0.123 both print "12.3%"; 1.45 and 1.4 both print "1.4".
  assert.deepEqual(
    compareStatWinners([withValue("winRate", 247 / 2000), withValue("winRate", 0.123)], {
      key: "winRate",
      format: "percent",
      polarity: "higher",
    }),
    [],
  );
  assert.deepEqual(
    compareStatWinners([withValue("kills", 29 / 20), withValue("kills", 1.4)], {
      key: "kills",
      format: "decimal1",
      polarity: "higher",
    }),
    [],
  );
  assert.deepEqual(
    compareStatWinners([withValue("kills", 1.5), withValue("kills", 1.4)], {
      key: "kills",
      format: "decimal1",
      polarity: "higher",
    }),
    [0],
  );
});

test("compareColorIndexes: a player keeps their color when the columns move", () => {
  assert.deepEqual(compareColorIndexes([30, 10, 20]), [2, 0, 1]);
  assert.deepEqual(compareColorIndexes([10, 30, 20]), [0, 2, 1]);
});

test("canonicalCardParams: one spelling per card, whatever else the URL carries", async () => {
  const { canonicalCardParams } = await import("./compare-share");
  const params = canonicalCardParams(
    new URLSearchParams("utm_source=discord&date_range=2026-01-01_2026-02-01&players=3,1,3,abc,2&hero=7"),
  );
  assert.equal(params.toString(), "players=3%2C1%2C2&hero=7&date_range=2026-01-01_2026-02-01");
  assert.equal(canonicalCardParams(new URLSearchParams("players=")).toString(), "");
});
