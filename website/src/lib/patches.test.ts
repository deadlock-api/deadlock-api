import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getPatch,
  isIndexedPatch,
  isSettled,
  mergePatchFeed,
  patchDateRange,
  patchLabel,
  type PatchEntry,
  type PatchFeedItem,
  patchWindows,
  previousPatch,
  windowDays,
} from "./patches";

const DAY = 86_400;
const unix = (iso: string) => Date.parse(iso) / 1000;

const entry = (id: string, start: string, shortName = id): PatchEntry => ({
  id,
  name: id,
  shortName,
  startUnix: unix(start),
});

// A slice of the real feed (2026-10-08), newest first.
const FEED: PatchFeedItem[] = [
  { source: "steam", pub_date: "2026-10-06T20:59:54Z", title: "Mind the Birds!" },
  { source: "steam", pub_date: "2026-10-05T23:05:32Z", title: " Minor Update - 10-05-2026" },
  { source: "forum", pub_date: "2026-10-05T23:00:12Z", title: "09-29-2026" },
  { source: "steam", pub_date: "2026-10-02T20:59:51Z", title: "Listen up, Crumbums! Your King is here." },
  { source: "steam", pub_date: "2026-09-29T20:25:11Z", title: "City Never Sleeps" },
  { source: "forum", pub_date: "2026-09-16T22:41:28Z", title: "08-22-2026 Update" },
  { source: "steam", pub_date: "2026-08-22T21:40:46Z", title: " Minor Update - 08-22-2026" },
  { source: "steam", pub_date: "2026-07-30T19:14:37Z", title: "Matchmaking Update" },
  { source: "forum", pub_date: "2026-03-31T01:35:20Z", title: "03-25-2026 Update" },
  { source: "forum", pub_date: "2026-03-21T19:34:30Z", title: "03-21-2026 Update" },
];

test("merge: one patch per release day, no hero spotlights, curated names kept", () => {
  const curated = [entry("2026-07-30", "2026-07-30T19:14:37Z", "Matchmaking")];
  const patches = mergePatchFeed(FEED, curated);
  assert.deepEqual(
    patches.map((p) => p.id),
    ["2026-10-05", "2026-09-29", "2026-08-22", "2026-07-30", "2026-03-25", "2026-03-21"],
  );
  const byId = new Map(patches.map((p) => [p.id, p]));
  // Steam's post is the release time, even though the forum thread was posted (or edited) days later.
  assert.equal(byId.get("2026-08-22")?.startUnix, unix("2026-08-22T21:40:46Z"));
  assert.equal(byId.get("2026-09-29")?.startUnix, unix("2026-09-29T20:25:11Z"));
  assert.equal(byId.get("2026-09-29")?.shortName, "City Never Sleeps");
  assert.equal(byId.get("2026-10-05")?.shortName, "Patch");
  assert.equal(byId.get("2026-07-30")?.shortName, "Matchmaking");
  // The forum alone, posted the same day: its time. Posted six days later: the usual release hour.
  assert.equal(byId.get("2026-03-21")?.startUnix, unix("2026-03-21T19:34:30Z"));
  assert.equal(byId.get("2026-03-25")?.startUnix, unix("2026-03-25T20:00:00Z"));
  // Each runs until the next.
  assert.equal(byId.get("2026-10-05")?.endUnix, undefined);
  assert.equal(byId.get("2026-09-29")?.endUnix, unix("2026-10-05T23:05:32Z"));
});

test("merge keeps curated patches the feed no longer reaches", () => {
  const patches = mergePatchFeed(FEED.slice(0, 2), [entry("2025-02-25", "2025-02-25T21:51:13Z", "Map Rework")]);
  assert.deepEqual(
    patches.map((p) => p.id),
    ["2026-10-05", "2025-02-25"],
  );
});

const PATCHES = mergePatchFeed(FEED, []);

test("lookup and neighbours", () => {
  assert.equal(getPatch(PATCHES, "2026-09-29")?.shortName, "City Never Sleeps");
  assert.equal(getPatch(PATCHES, "nope"), undefined);
  assert.equal(previousPatch(PATCHES, "2026-10-05")?.id, "2026-09-29");
  assert.equal(previousPatch(PATCHES, "2026-03-21"), undefined);
});

test("windows stop at the neighbouring patches, never at now", () => {
  const big = getPatch(PATCHES, "2026-09-29")!;
  const windows = patchWindows(big, previousPatch(PATCHES, big.id));
  // The patch before started 38 days earlier: a full 7 days. The hotfix came 6 days after: 6 days.
  assert.deepEqual(windows.before, { minUnixTimestamp: big.startUnix - 7 * DAY, maxUnixTimestamp: big.startUnix });
  assert.equal(windows.after.maxUnixTimestamp, unix("2026-10-05T23:05:32Z"));

  const hotfix = getPatch(PATCHES, "2026-10-05")!;
  const hotfixWindows = patchWindows(hotfix, big);
  assert.equal(hotfixWindows.before.minUnixTimestamp, big.startUnix);
  assert.equal(hotfixWindows.after.maxUnixTimestamp, hotfix.startUnix + 7 * DAY);
});

test("settled and window length", () => {
  const hotfix = getPatch(PATCHES, "2026-10-05")!;
  const windows = patchWindows(hotfix, undefined);
  assert.equal(isSettled(windows, hotfix.startUnix + 3 * DAY), false);
  assert.equal(isSettled(windows, hotfix.startUnix + 7 * DAY), true);
  assert.equal(windowDays(windows.after, hotfix.startUnix + 3 * DAY), 3);
  assert.equal(windowDays(windows.after, hotfix.startUnix + 30 * DAY), 7);
  assert.equal(windowDays(windows.after, hotfix.startUnix - DAY), 0);
});

test("only the newest patches are indexed", () => {
  assert.equal(isIndexedPatch(PATCHES, "2026-10-05"), true);
  assert.equal(isIndexedPatch(PATCHES, "2026-03-21"), false);
});

test("labels name the patch, or its date for a plain update", () => {
  assert.equal(patchLabel(getPatch(PATCHES, "2026-09-29")!), "City Never Sleeps Patch");
  assert.equal(patchLabel(getPatch(PATCHES, "2026-10-05")!), "Oct 5, 2026 Patch");
});

test("date range: exact instants, open while the patch runs", () => {
  assert.equal(patchDateRange(getPatch(PATCHES, "2026-09-29")!), "2026-09-29T20:25:11.000Z_2026-10-05T23:05:32.000Z");
  assert.equal(patchDateRange(getPatch(PATCHES, "2026-10-05")!), "2026-10-05T23:05:32.000Z_");
});
