import assert from "node:assert/strict";
import { test } from "node:test";

import type { PlayerMatchHistoryEntry } from "deadlock_api_client";

import { day } from "~/dayjs";

import { computeActivity, filterMatches, filtersForActivityPeriod, type TrackerFilterValues } from "./compute";

const filters: TrackerFilterValues = { mode: "normal_all", heroId: null, result: "all" };

function inTimezone(timezone: string, run: () => void) {
  const previous = process.env.TZ;
  process.env.TZ = timezone;
  try {
    run();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

function match(matchId: number, timestamp: number): PlayerMatchHistoryEntry {
  return {
    match_id: matchId,
    start_time: timestamp,
    game_mode: 1,
    match_mode: 1,
    hero_id: 6,
    player_team: 0,
    match_result: 0,
  } as PlayerMatchHistoryEntry;
}

test("activity drill-down includes exactly one local week across daylight-saving transitions", () => {
  inTimezone("Europe/Berlin", () => {
    for (const [date, hours] of [
      ["2026-03-29", 167],
      ["2026-10-25", 169],
    ] as const) {
      const start = day(date).startOf("week");
      const selected = filtersForActivityPeriod(filters, start.unix(), "week");
      assert.equal(selected.minUnixTimestamp, start.unix());
      assert.equal(selected.maxUnixTimestamp, start.add(1, "week").unix() - 1);
      assert.equal((selected.maxUnixTimestamp! - selected.minUnixTimestamp! + 1) / 3600, hours);
      const entries = [
        match(1, start.unix() - 1),
        match(2, start.unix()),
        match(3, selected.maxUnixTimestamp!),
        match(4, selected.maxUnixTimestamp! + 1),
      ];
      assert.deepEqual(
        filterMatches(entries, selected).map((entry) => entry.match_id),
        [3, 2],
      );
    }
  });
});

test("monthly activity drill-down follows calendar boundaries, including leap years", () => {
  inTimezone("Europe/Berlin", () => {
    for (const date of ["2024-02-01", "2026-03-01", "2026-10-01", "2026-12-01"]) {
      const start = day(date);
      const selected = filtersForActivityPeriod(filters, start.unix(), "month");
      assert.equal(selected.minUnixTimestamp, start.unix());
      assert.equal(selected.maxUnixTimestamp, start.endOf("month").unix());
    }
  });
});

test("activity drill-down intersects existing dates and preserves other filters", () => {
  const start = day("2026-06-01");
  const current: TrackerFilterValues = {
    mode: "street_brawl",
    heroId: 6,
    result: "loss",
    minUnixTimestamp: start.add(3, "day").unix(),
    maxUnixTimestamp: start.add(10, "day").unix(),
  };
  assert.deepEqual(filtersForActivityPeriod(current, start.unix(), "month"), current);
  assert.equal(
    filtersForActivityPeriod({ ...current, maxUnixTimestamp: null }, start.unix(), "month").maxUnixTimestamp,
    start.endOf("month").unix(),
  );
  assert.equal(
    filtersForActivityPeriod({ ...current, minUnixTimestamp: null }, start.unix(), "month").minUnixTimestamp,
    start.unix(),
  );
});

test("activity bucket drill-down reproduces displayed counts, including empty weeks", () => {
  inTimezone("Europe/Berlin", () => {
    const entries = [
      match(1, day("2026-03-27T23:00").unix()),
      match(2, day("2026-03-29T03:30").unix()),
      match(3, day("2026-04-12T18:00").unix()),
    ];
    const activity = computeActivity(entries);
    assert.equal(activity.granularity, "week");
    assert.ok(activity.buckets.some((bucket) => bucket.wins + bucket.losses === 0));
    for (const bucket of activity.buckets) {
      const selected = filtersForActivityPeriod(filters, bucket.bucketStartUnix, activity.granularity);
      assert.equal(filterMatches(entries, selected).length, bucket.wins + bucket.losses);
    }
  });
});
