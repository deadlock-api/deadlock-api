import { cachedJson, type JsonCache, NO_CACHE } from "~/lib/edge-cache";
import type { D1Database, D1PreparedStatement } from "~/lib/worker-env";

import { tierOfBadge } from "./scoring";

// The community's guesses. A vote counts once per voter and video: the voter is a salted SHA-256 of the client's IP
// address and the video, so the table never holds an address and a voter cannot be followed from one video to the next.

const VOTER_SALT = "deadlock-api.com:guess-the-rank:v1";

/** The anonymous id of the voter at `ip` for `videoId`. */
export async function voterHash(ip: string, videoId: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${VOTER_SALT}\n${ip}\n${videoId}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** A round's answer, sent only to a voter who already voted on its video. */
export interface RoundResult {
  badge: number;
  tier: number;
  /** The tier this voter's vote counted for: their first guess, if they guessed again from another tab. */
  guess: number;
  /** Votes per guessed tier. */
  stats: Record<number, number>;
  total: number;
}

// The voter is recorded first; the tally only moves when that insert added a row (`changes()` reads the statement
// before it, and a batch runs in order in one transaction), so a second guess changes nothing.
const RECORD_VOTER =
  "INSERT INTO voters (video_id, voter, tier) VALUES (?1, ?2, ?3) ON CONFLICT (video_id, voter) DO NOTHING";
const COUNT_VOTE =
  "INSERT INTO votes (video_id, tier, count) SELECT ?1, ?2, 1 WHERE changes() = 1 " +
  "ON CONFLICT (video_id, tier) DO UPDATE SET count = count + 1";
const VOTER_GUESS = "SELECT tier FROM voters WHERE video_id = ?1 AND voter = ?2";
const TALLY = "SELECT tier, count FROM votes WHERE video_id = ?1";

/** The statements that record a vote, then read back the voter's counted guess and the tally, as one batch. */
export function voteStatements(db: D1Database, videoId: string, voter: string, tier: number): D1PreparedStatement[] {
  return [
    db.prepare(RECORD_VOTER).bind(videoId, voter, tier),
    db.prepare(COUNT_VOTE).bind(videoId, tier),
    db.prepare(VOTER_GUESS).bind(videoId, voter),
    db.prepare(TALLY).bind(videoId),
  ];
}

// The edge cache (src/lib/edge-cache.ts) keeps D1 out of repeated requests. A counted guess never changes, so it is
// kept for a week and a voter asking again (or guessing again) costs no read. "Not voted yet" is kept briefly, and a
// vote replaces it. The tally may lag other voters' votes by `TALLY_TTL_SECONDS`.
const GUESS_TTL_SECONDS = 7 * 86_400;
const NO_GUESS_TTL_SECONDS = 60;
const TALLY_TTL_SECONDS = 30;

const guessKey = (videoId: string, voter: string) => `guess-the-rank/guess/${videoId}/${voter}`;
const tallyKey = (videoId: string) => `guess-the-rank/tally/${videoId}`;

type Rows = Record<string, unknown>[];

function readTally(db: D1Database, cache: JsonCache, videoId: string): Promise<Rows> {
  return cachedJson(cache, tallyKey(videoId), TALLY_TTL_SECONDS, async () => {
    const { results } = await db.prepare(TALLY).bind(videoId).all();
    return results;
  });
}

/** Records a vote (once per voter) and returns the round's answer with the tally. */
export async function recordVote(
  db: D1Database,
  video: { id: string; badge: number },
  voter: string,
  tier: number,
  cache: JsonCache = NO_CACHE,
): Promise<RoundResult> {
  const known = await cache.get<Rows>(guessKey(video.id, voter));
  if (known?.value.length) {
    const counted = toRoundResult(video.badge, known.value, await readTally(db, cache, video.id));
    if (counted) return counted;
  }
  const results = await db.batch(voteStatements(db, video.id, voter, tier));
  const [voterRows, tallyRows] = [results[2].results, results[3].results];
  await Promise.all([
    cache.set(guessKey(video.id, voter), voterRows, GUESS_TTL_SECONDS),
    cache.set(tallyKey(video.id), tallyRows, TALLY_TTL_SECONDS),
  ]);
  return toRoundResult(video.badge, voterRows, tallyRows) ?? emptyResult(video.badge, tier);
}

/** The round's answer for a voter who already voted on it; null for anyone else, who must not learn the rank. */
export async function readResult(
  db: D1Database,
  video: { id: string; badge: number },
  voter: string,
  cache: JsonCache = NO_CACHE,
): Promise<RoundResult | null> {
  const key = guessKey(video.id, voter);
  let voterRows = (await cache.get<Rows>(key))?.value;
  if (!voterRows) {
    ({ results: voterRows } = await db.prepare(VOTER_GUESS).bind(video.id, voter).all());
    await cache.set(key, voterRows, voterRows.length > 0 ? GUESS_TTL_SECONDS : NO_GUESS_TTL_SECONDS);
  }
  if (voterRows.length === 0) return null;
  return toRoundResult(video.badge, voterRows, await readTally(db, cache, video.id));
}

function emptyResult(badge: number, guess: number): RoundResult {
  return { badge, tier: tierOfBadge(badge), guess, stats: {}, total: 0 };
}

/** The payload from the read-back rows; null when the voter has no vote on the video. */
export function toRoundResult(
  badge: number,
  voterRows: readonly Record<string, unknown>[],
  tallyRows: readonly Record<string, unknown>[],
): RoundResult | null {
  const guess = Number(voterRows[0]?.tier);
  if (!Number.isInteger(guess)) return null;
  const stats: Record<number, number> = {};
  let total = 0;
  for (const row of tallyRows) {
    const tier = Number(row.tier);
    const count = Number(row.count);
    if (!Number.isInteger(tier) || !(count > 0)) continue;
    stats[tier] = count;
    total += count;
  }
  return { badge, tier: tierOfBadge(badge), guess, stats, total };
}
