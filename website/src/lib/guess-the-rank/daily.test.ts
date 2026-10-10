import assert from "node:assert/strict";
import { test } from "node:test";

import { getModeSeed, seededRandom, seededShuffle } from "~/lib/daily-seed";

import { dailyPool, objectUrl, pickDailyVideos, ROUNDS_PER_DAY, toDailyRounds, type VideoRow } from "./daily";

function row(id: string, overrides: Partial<VideoRow> = {}): VideoRow {
  return {
    id,
    r2_key: `videos/${id}.mp4`,
    poster_key: `videos/${id}.jpg`,
    badge: 74,
    duration_s: 120,
    added_at: "2026-10-01T12:00:00Z",
    active: 1,
    ...overrides,
  };
}

const ROWS = ["c", "a", "e", "b", "d"].map((id) => row(id));
const ALL_KEYS = new Set(ROWS.map((r) => r.r2_key));

test("the pool is every active row in the bucket added before the day began, ordered by id", () => {
  const rows = [
    ...ROWS,
    row("late", { added_at: "2026-10-10T00:00:00Z" }),
    row("withdrawn", { active: 0 }),
    row("missing"),
    row("bad-date", { added_at: "yesterday" }),
  ];
  const keys = new Set([...ALL_KEYS, "videos/late.mp4", "videos/withdrawn.mp4", "videos/bad-date.mp4"]);
  assert.deepEqual(
    dailyPool(rows, keys, "2026-10-10").map((r) => r.id),
    ["a", "b", "c", "d", "e"],
  );
  // A video added during a day plays from the next day on.
  assert.ok(dailyPool(rows, keys, "2026-10-11").some((r) => r.id === "late"));
});

test("a day draws the same rounds whatever order the rows arrive in", () => {
  const first = pickDailyVideos(dailyPool(ROWS, ALL_KEYS, "2026-10-10"), "2026-10-10");
  const second = pickDailyVideos(dailyPool(ROWS.toReversed(), ALL_KEYS, "2026-10-10"), "2026-10-10");
  assert.equal(first.length, ROUNDS_PER_DAY);
  assert.deepEqual(first, second);
  assert.equal(new Set(first.map((r) => r.id)).size, ROUNDS_PER_DAY);
});

test("the draw is Deadlockdle's seeded shuffle under the guess-the-rank seed", () => {
  const pool = dailyPool(ROWS, ALL_KEYS, "2026-10-12");
  const expected = seededShuffle([...pool], seededRandom(getModeSeed("2026-10-12", "guess-the-rank"))).slice(0, 3);
  assert.deepEqual(pickDailyVideos(pool, "2026-10-12"), expected);
});

test("a small pool plays what it has; an empty one plays nothing", () => {
  assert.equal(pickDailyVideos([row("only")], "2026-10-10").length, 1);
  assert.deepEqual(pickDailyVideos([], "2026-10-10"), []);
});

test("the browser gets the clip, never its rank", () => {
  const [round] = toDailyRounds([row("abc", { poster_key: null })]);
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
