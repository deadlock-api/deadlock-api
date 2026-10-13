import assert from "node:assert/strict";
import { test } from "node:test";

import { dayPoints, playerHash, readDayScores, recordDayScore, toDayScores } from "./scores";
import { memoryCache, testDatabase } from "./test-database";
import { recordVote, voterHash } from "./votes";

const DATE = "2026-10-12";
const VIDEOS = [
  { id: "v1", badge: 74 },
  { id: "v2", badge: 31 },
  { id: "v3", badge: 116 },
];

const seededDatabase = () =>
  testDatabase(
    VIDEOS.map(
      ({ id, badge }) =>
        "INSERT INTO videos (id, r2_key, badge, hero_id, match_id, duration_s, added_at) " +
        `VALUES ('${id}', 'videos/${id}.mp4', ${badge}, 1, 1, 120, '2026-10-01T00:00:00Z');`,
    ).join("\n"),
  );

test("a player's day points come from their own votes, once every clip is guessed", async () => {
  const db = seededDatabase();
  const ip = "203.0.113.7";
  await recordVote(db, VIDEOS[0], await voterHash(ip, "v1"), 7);
  await recordVote(db, VIDEOS[1], await voterHash(ip, "v2"), 5);
  assert.equal(await dayPoints(db, VIDEOS, ip), null);

  await recordVote(db, VIDEOS[2], await voterHash(ip, "v3"), 4);
  // Exact (5), two tiers off (3), seven off (0).
  assert.equal(await dayPoints(db, VIDEOS, ip), 8);
  assert.equal(await dayPoints(db, VIDEOS, "203.0.113.8"), null);
  assert.equal(await dayPoints(db, [], ip), null);
});

test("a player's score counts once per day", async () => {
  const db = seededDatabase();
  const cache = memoryCache();
  await recordDayScore(db, DATE, "player-a", 8, cache);
  await recordDayScore(db, DATE, "player-a", 8, cache);
  await recordDayScore(db, DATE, "player-a", 15);
  await recordDayScore(db, DATE, "player-b", 8);
  await recordDayScore(db, DATE, "player-c", 15);
  await recordDayScore(db, "2026-10-11", "player-a", 3);
  assert.deepEqual(await readDayScores(db, DATE), { stats: { 8: 2, 15: 1 }, total: 3 });
  assert.deepEqual(await readDayScores(db, "2026-10-13"), { stats: {}, total: 0 });
});

test("the player id is a salted hash per address and day", async () => {
  const a = await playerHash("203.0.113.7", DATE);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a, await playerHash("203.0.113.7", DATE));
  assert.notEqual(a, await playerHash("203.0.113.7", "2026-10-11"));
  assert.notEqual(a, await voterHash("203.0.113.7", DATE));
});

test("rows that are not counts are left out of the day's tally", () => {
  assert.deepEqual(
    toDayScores([
      { points: 0, count: 2 },
      { points: "x", count: 1 },
      { points: 4, count: 0 },
      { points: -1, count: 3 },
    ]),
    { stats: { 0: 2 }, total: 2 },
  );
});
