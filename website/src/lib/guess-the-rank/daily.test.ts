import assert from "node:assert/strict";
import { test } from "node:test";

import { getModeSeed, seededRandom, seededShuffle } from "~/lib/daily-seed";

import { objectUrl, roundOrder, ROUNDS_PER_DAY, selectDailyVideos, toDailyRounds, type VideoRow } from "./daily";

function row(id: string, play_date: string | null, overrides: Partial<VideoRow> = {}): VideoRow {
  return {
    id,
    r2_key: `videos/${id}.mp4`,
    poster_key: `videos/${id}.jpg`,
    badge: 74,
    duration_s: 120,
    active: 1,
    play_date,
    ...overrides,
  };
}

const ROWS = [
  row("a1", "2026-10-11"),
  row("a2", "2026-10-11"),
  row("a3", "2026-10-11"),
  row("b1", "2026-10-12"),
  row("b2", "2026-10-12"),
  row("b3", "2026-10-12"),
  row("c1", "2026-10-13"),
  row("c2", "2026-10-13"),
  row("c3", "2026-10-13"),
  row("unscheduled", null),
];
const keysOf = (rows: readonly VideoRow[]) => new Set(rows.map((r) => r.r2_key));
const ids = (rows: readonly VideoRow[]) => rows.map((r) => r.id);

test("a scheduled day plays its own three, ordered by the day's seeded shuffle of their ids", () => {
  const day = selectDailyVideos(ROWS.toReversed(), keysOf(ROWS), "2026-10-12");
  assert.deepEqual(ids(day).toSorted(), ["b1", "b2", "b3"]);
  const expected = seededShuffle(["b1", "b2", "b3"], seededRandom(getModeSeed("2026-10-12", "guess-the-rank")));
  assert.deepEqual(ids(day), expected);
  assert.deepEqual(day, roundOrder(day, "2026-10-12"));
});

test("a short day is topped up from days already played, never from its own or a later day", () => {
  const rows = ROWS.filter((r) => r.id !== "c3");
  const day = selectDailyVideos(rows, keysOf(rows), "2026-10-13");
  assert.equal(day.length, ROUNDS_PER_DAY);
  assert.ok(ids(day).includes("c1") && ids(day).includes("c2"));
  const extra = ids(day).filter((id) => !id.startsWith("c"));
  assert.equal(extra.length, 1);
  assert.match(extra[0], /^[ab]/);
  // The draw is the day's own: every request for the day tops up with the same video.
  assert.deepEqual(ids(selectDailyVideos(rows.toReversed(), keysOf(rows), "2026-10-13")), ids(day));
});

test("a withdrawn video leaves its day with two of its own and one top-up", () => {
  const rows = ROWS.map((r) => (r.id === "b2" ? { ...r, active: 0 } : r));
  const day = selectDailyVideos(rows, keysOf(rows), "2026-10-12");
  assert.equal(day.length, 3);
  assert.ok(!ids(day).includes("b2"));
  assert.deepEqual(
    ids(day)
      .filter((id) => id.startsWith("b"))
      .toSorted(),
    ["b1", "b3"],
  );
  assert.match(ids(day).find((id) => !id.startsWith("b")) ?? "", /^a/);
});

test("a video missing from the bucket counts as not there", () => {
  const keys = keysOf(ROWS);
  keys.delete("videos/a1.mp4");
  const day = selectDailyVideos(ROWS, keys, "2026-10-11");
  assert.deepEqual(ids(day).toSorted(), ["a2", "a3"]);
});

test("later days never leak: not as a day's own, not as a top-up", () => {
  for (const date of ["2026-10-11", "2026-10-12"]) {
    const day = selectDailyVideos(ROWS, keysOf(ROWS), date);
    assert.ok(
      day.every((r) => r.play_date != null && r.play_date <= date),
      date,
    );
  }
  // The first day has no earlier days to top up from; unscheduled videos never play.
  assert.deepEqual(selectDailyVideos(ROWS, keysOf(ROWS), "2026-10-10"), []);
  assert.ok(!ids(selectDailyVideos(ROWS, keysOf(ROWS), "2026-10-20")).includes("unscheduled"));
});

test("an unscheduled day plays three videos from earlier days", () => {
  const day = selectDailyVideos(ROWS, keysOf(ROWS), "2026-10-20");
  assert.equal(day.length, 3);
  assert.equal(new Set(ids(day)).size, 3);
});

test("the launch day keeps the round order it was first played in", () => {
  const launch = ["0c295560cc03a777", "703749758aa6c30f", "bd563e614e11d186"];
  const rows = launch.toReversed().map((id) => row(id, "2026-10-10"));
  assert.deepEqual(ids(selectDailyVideos(rows, keysOf(rows), "2026-10-10")), launch);
});

test("the browser gets the clip, never its rank", () => {
  const [round] = toDailyRounds([row("abc", "2026-10-11", { poster_key: null })]);
  assert.deepEqual(round, {
    round: 0,
    videoId: "abc",
    videoUrl: "https://guess-the-rank.deadlock-api.com/videos/abc.mp4",
    posterUrl: null,
    durationS: 120,
  });
  assert.ok(!("badge" in round));
  assert.equal(objectUrl("videos/a b.mp4"), "https://guess-the-rank.deadlock-api.com/videos/a%20b.mp4");
});
