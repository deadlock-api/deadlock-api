import { cachedJson, type JsonCache, NO_CACHE } from "~/lib/edge-cache";
import type { D1Database } from "~/lib/worker-env";

import { roundPoints, tierOfBadge } from "./scoring";
import { readGuess, voterHash } from "./votes";

// The day's scores. A player counts once per day: the player is a salted SHA-256 of the client's IP address and the
// day. Their points are worked out here from their own votes on the day's videos, so nobody can send in a score, and a
// player whose votes are not all under one address (they changed networks mid-game) is not counted.

const PLAYER_SALT = "deadlock-api.com:guess-the-rank:day:v1";

/** The anonymous id of the player at `ip` on `date`. */
export async function playerHash(ip: string, date: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${PLAYER_SALT}\n${ip}\n${date}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** How everyone scored on a day. */
export interface DayScores {
  /** Players per day score. */
  stats: Record<number, number>;
  total: number;
}

// As with votes, the player is recorded first and the tally only moves when that insert added a row.
const RECORD_PLAYER =
  "INSERT INTO day_players (date, player, points) VALUES (?1, ?2, ?3) ON CONFLICT (date, player) DO NOTHING";
const COUNT_SCORE =
  "INSERT INTO day_scores (date, points, count) SELECT ?1, ?2, 1 WHERE changes() = 1 " +
  "ON CONFLICT (date, points) DO UPDATE SET count = count + 1";
const SCORES = "SELECT points, count FROM day_scores WHERE date = ?1";

// A recorded player stays recorded, so that is kept for a week and asking again costs no write. The tally may lag
// other players by `SCORES_TTL_SECONDS`.
const RECORDED_TTL_SECONDS = 7 * 86_400;
const SCORES_TTL_SECONDS = 30;

const recordedKey = (date: string, player: string) => `guess-the-rank/day-player/${date}/${player}`;
const scoresKey = (date: string) => `guess-the-rank/day-scores/${date}`;

type Rows = Record<string, unknown>[];

/** The day's points of the voter at `ip`; null until they have voted on every one of the day's videos. */
export async function dayPoints(
  db: D1Database,
  videos: readonly { id: string; badge: number }[],
  ip: string,
  cache: JsonCache = NO_CACHE,
): Promise<number | null> {
  if (videos.length === 0) return null;
  const guesses = await Promise.all(
    videos.map(async (video) => readGuess(db, video.id, await voterHash(ip, video.id), cache)),
  );
  let points = 0;
  for (const [i, guess] of guesses.entries()) {
    if (guess === null) return null;
    points += roundPoints(guess, tierOfBadge(videos[i].badge));
  }
  return points;
}

/** Counts the player's day score, once; a player already counted changes nothing. */
export async function recordDayScore(
  db: D1Database,
  date: string,
  player: string,
  points: number,
  cache: JsonCache = NO_CACHE,
): Promise<void> {
  const key = recordedKey(date, player);
  if (await cache.get(key)) return;
  const results = await db.batch([
    db.prepare(RECORD_PLAYER).bind(date, player, points),
    db.prepare(COUNT_SCORE).bind(date, points),
    db.prepare(SCORES).bind(date),
  ]);
  await Promise.all([
    cache.set(key, true, RECORDED_TTL_SECONDS),
    cache.set(scoresKey(date), results[2].results, SCORES_TTL_SECONDS),
  ]);
}

/** How everyone scored on `date`. */
export async function readDayScores(db: D1Database, date: string, cache: JsonCache = NO_CACHE): Promise<DayScores> {
  const rows = await cachedJson<Rows>(cache, scoresKey(date), SCORES_TTL_SECONDS, async () => {
    const { results } = await db.prepare(SCORES).bind(date).all();
    return results;
  });
  return toDayScores(rows);
}

/** The tally from its rows. */
export function toDayScores(rows: readonly Record<string, unknown>[]): DayScores {
  const stats: Record<number, number> = {};
  let total = 0;
  for (const row of rows) {
    const points = Number(row.points);
    const count = Number(row.count);
    if (!Number.isInteger(points) || points < 0 || !(count > 0)) continue;
    stats[points] = count;
    total += count;
  }
  return { stats, total };
}
