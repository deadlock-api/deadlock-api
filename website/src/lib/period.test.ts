import assert from "node:assert/strict";
import { test } from "node:test";

import { day } from "~/dayjs";

import type { PatchEntry } from "./patches";
import {
  canonicalPeriod,
  customPeriod,
  defaultPeriod,
  defaultPrevUnixRange,
  defaultUnixRange,
  parseAsPeriod,
  type Period,
  periodBounds,
  type PeriodLists,
  periodLabel,
  previousBounds,
  resolvePeriod,
} from "./period";
import type { SeasonInfo } from "./seasons";

const unix = (iso: string) => Date.parse(iso) / 1000;

// The feed's patches from 2026-11-26, newest first: two of them are not in the curated list.
const PATCHES: PatchEntry[] = [
  {
    id: "2026-11-26",
    name: "Update (2026-11-26)",
    shortName: "Patch",
    startUnix: unix("2026-11-26T17:21:48Z"),
    kind: "update",
  },
  {
    id: "2026-11-04",
    name: "Update (2026-11-04)",
    shortName: "Patch",
    startUnix: unix("2026-11-05T05:02:30Z"),
    endUnix: unix("2026-11-26T17:21:48Z"),
    kind: "update",
  },
  {
    id: "2026-10-30",
    name: "Halloween (2026-10-30)",
    shortName: "Halloween",
    startUnix: unix("2026-10-30T20:51:49Z"),
    endUnix: unix("2026-11-05T05:02:30Z"),
    kind: "update",
  },
];

const season = (id: string, start: string, end: string, running = false): SeasonInfo => ({
  id,
  name: id,
  startDate: day.unix(unix(start)),
  endDate: running ? undefined : day.unix(unix(end)),
  scheduledEndDate: day.unix(unix(end)),
});

const SEASONS = [
  season("season_2", "2026-11-05T19:58:14Z", "2027-02-01T00:00:00Z", true),
  season("season_1", "2026-08-21T20:00:00Z", "2026-11-05T19:58:14Z"),
];

const LISTS: PeriodLists = { patches: PATCHES, seasons: SEASONS };
const patch = (id: string): Period => ({ kind: "patch", id });

test("date_range names a patch or a season, or holds a custom range", () => {
  assert.deepEqual(parseAsPeriod.parse("patch:2026-11-26"), patch("2026-11-26"));
  assert.deepEqual(parseAsPeriod.parse("season:season_2"), { kind: "season", id: "season_2" });
  assert.equal(parseAsPeriod.parse("patch:"), null);
  assert.equal(parseAsPeriod.parse("nonsense"), null);
  const custom = parseAsPeriod.parse("2026-10-01_2026-10-07");
  assert.equal(custom?.kind, "custom");
  for (const value of ["patch:2026-11-26", "season:season_2", "2026-10-01_2026-10-07", "_"]) {
    assert.equal(parseAsPeriod.serialize(parseAsPeriod.parse(value)!), value);
  }
});

test("a feed-only patch keeps its exact bounds", () => {
  assert.deepEqual(periodBounds(patch("2026-11-26"), LISTS), {
    minUnixTimestamp: unix("2026-11-26T17:21:48Z"),
    maxUnixTimestamp: undefined,
  });
  assert.deepEqual(periodBounds(patch("2026-11-04"), LISTS), {
    minUnixTimestamp: unix("2026-11-05T05:02:30Z"),
    maxUnixTimestamp: unix("2026-11-26T17:21:48Z"),
  });
  // Compared with the patch before it, not a same-length window.
  assert.deepEqual(previousBounds(patch("2026-11-26"), LISTS), {
    minUnixTimestamp: unix("2026-11-05T05:02:30Z"),
    maxUnixTimestamp: unix("2026-11-26T17:21:48Z"),
  });
  assert.equal(previousBounds(patch("2026-10-30"), LISTS), undefined);
  assert.equal(periodLabel(patch("2026-11-04"), LISTS), "Update (2026-11-04)");
});

test("a custom range rounds to whole UTC days, and its previous period is the days before", () => {
  const range = parseAsPeriod.parse("2026-10-01_2026-10-07")!;
  assert.deepEqual(periodBounds(range, LISTS), {
    minUnixTimestamp: unix("2026-10-01T00:00:00Z"),
    maxUnixTimestamp: unix("2026-10-07T23:59:59Z"),
  });
  assert.deepEqual(previousBounds(range, LISTS), {
    minUnixTimestamp: unix("2026-09-24T00:00:00Z"),
    maxUnixTimestamp: unix("2026-09-30T23:59:59Z"),
  });
  assert.equal(previousBounds(customPeriod(day.utc("2026-10-01")), LISTS), undefined);
});

test("a custom bound on a patch or season boundary stays exact", () => {
  const pinned = customPeriod(day.unix(unix("2026-11-05T19:58:14Z")), day.utc("2026-11-26").endOf("day"));
  assert.deepEqual(periodBounds(pinned, LISTS), {
    minUnixTimestamp: unix("2026-11-05T19:58:14Z"),
    maxUnixTimestamp: unix("2026-11-26T23:59:59Z"),
  });
});

test("an old link spelling a patch or a season out reads as that period", () => {
  const oldPatchLink = parseAsPeriod.parse("2026-11-05T05:02:30.000Z_2026-11-26T17:21:48.000Z")!;
  assert.deepEqual(canonicalPeriod(oldPatchLink, LISTS), patch("2026-11-04"));
  const oldSeasonLink = parseAsPeriod.parse("2026-11-05T19:58:14.000Z_")!;
  assert.deepEqual(canonicalPeriod(oldSeasonLink, LISTS), { kind: "season", id: "season_2" });
  const custom = parseAsPeriod.parse("2026-11-05_2026-11-26")!;
  assert.equal(canonicalPeriod(custom, LISTS), custom);
});

test("an unknown id falls back", () => {
  const fallback = defaultPeriod(LISTS, "patch");
  assert.deepEqual(fallback, patch("2026-11-26"));
  assert.equal(resolvePeriod(patch("2020-01-01"), LISTS, fallback), fallback);
  assert.equal(resolvePeriod(null, LISTS, fallback), fallback);
  assert.deepEqual(resolvePeriod(patch("2026-11-04"), LISTS, fallback), patch("2026-11-04"));
});

test("the default period is the season, else the latest patch", () => {
  assert.deepEqual(defaultPeriod(LISTS, "season"), { kind: "season", id: "season_2" });
  assert.deepEqual(defaultPeriod({ patches: PATCHES, seasons: [] }, "season"), patch("2026-11-26"));
  assert.deepEqual(defaultUnixRange(LISTS, "patch"), {
    minUnixTimestamp: unix("2026-11-26T17:21:48Z"),
    maxUnixTimestamp: undefined,
  });
  assert.deepEqual(defaultPrevUnixRange(LISTS, "season"), {
    minUnixTimestamp: unix("2026-08-21T20:00:00Z"),
    maxUnixTimestamp: unix("2026-11-05T19:58:14Z"),
  });
});
