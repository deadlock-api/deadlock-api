import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

import { api } from "~/lib/api";
import { cachedJson, edgeCache } from "~/lib/edge-cache";
import type { R2Bucket, WorkerEnv } from "~/lib/worker-env";

import {
  type DailyRound,
  isValidGuessDate,
  ROUNDS_PER_DAY,
  selectDailyVideos,
  toDailyRounds,
  VIDEO_PREFIX,
  type VideoRow,
} from "./daily";
import { guessableTiers } from "./scoring";
import { readResult, recordVote, type RoundResult, voterHash } from "./votes";

// Guess the Rank's server side. The rank of a clip never leaves the Worker before its voter has guessed: the rounds
// carry only the clip, and a result is sent in answer to a vote, or to a voter who already voted.
//
// Under the Vite dev server there is no Worker and no bindings: every day is empty and the page shows its empty state.

/** How long an isolate, and the location's edge cache, keep a day's videos. The schedule of today and past days never
 * changes, but an upload that lands late or a withdrawn video does. */
const POOL_TTL_MS = 5 * 60_000;

/** This location's cache in front of D1 and the R2 listing, shared by its isolates. */
const cache = edgeCache("guess-the-rank");

const pools = new Map<string, { at: number; videos: Promise<VideoRow[]> }>();

async function bucketKeys(bucket: R2Bucket): Promise<Set<string>> {
  const keys = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix: VIDEO_PREFIX, cursor });
    for (const object of page.objects) keys.add(object.key);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return keys;
}

async function loadDailyVideos(env: WorkerEnv, date: string): Promise<VideoRow[]> {
  const db = env.GUESS_THE_RANK_DB;
  const bucket = env.GUESS_THE_RANK_VIDEOS;
  if (!db || !bucket) return [];
  const [rows, keys] = await Promise.all([
    // Only this day and the days before it: a later day's videos never leave the database early.
    db
      .prepare(
        "SELECT id, r2_key, poster_key, badge, duration_s, active, play_date FROM videos " +
          "WHERE active = 1 AND play_date IS NOT NULL AND play_date <= ?1",
      )
      .bind(date)
      .all<VideoRow>(),
    bucketKeys(bucket),
  ]);
  return selectDailyVideos(rows.results, keys, date);
}

/** The day's videos in round order, kept per isolate and in the edge cache for `POOL_TTL_MS`. */
function dailyVideos(env: WorkerEnv | undefined, date: string, now = Date.now()): Promise<VideoRow[]> {
  if (!env) return Promise.resolve([]);
  const cached = pools.get(date);
  if (cached && now - cached.at < POOL_TTL_MS) return cached.videos;
  const videos = cachedJson(cache, `guess-the-rank/daily/${date}`, POOL_TTL_MS / 1000, () =>
    loadDailyVideos(env, date),
  );
  pools.set(date, { at: now, videos });
  // A failed read is not kept: the next request tries again.
  videos.catch(() => pools.delete(date));
  return videos;
}

let tiers: Promise<ReadonlySet<number>> | undefined;

/** The tiers a guess may name, from the assets API's ranks; read once per isolate. */
function validTiers(): Promise<ReadonlySet<number>> {
  tiers ??= api.ranks_api
    .listRanks()
    .then(({ data }) => new Set(guessableTiers(data)))
    .catch((error: unknown) => {
      tiers = undefined;
      throw error;
    });
  return tiers;
}

function requireDate(data: Record<string, unknown>): string {
  const { date } = data;
  if (typeof date !== "string" || !isValidGuessDate(date)) throw new Error("Invalid date");
  return date;
}

interface RoundInput {
  date: string;
  round: number;
  /** The clip the browser plays in that round; a mismatch means its rounds are out of date. */
  videoId: string;
}

function validateRoundInput(input: unknown): RoundInput {
  const data = (input ?? {}) as Record<string, unknown>;
  const { round, videoId } = data;
  if (typeof round !== "number" || !Number.isInteger(round) || round < 0 || round >= ROUNDS_PER_DAY) {
    throw new Error("Invalid round");
  }
  if (typeof videoId !== "string" || videoId.length === 0 || videoId.length > 64) throw new Error("Invalid video");
  return { date: requireDate(data), round, videoId };
}

/** The round's video, when it is the one the browser names. */
async function roundVideo(env: WorkerEnv | undefined, { date, round, videoId }: RoundInput): Promise<VideoRow> {
  const video = (await dailyVideos(env, date))[round];
  if (!video || video.id !== videoId) throw new Error("This round is not part of that day");
  return video;
}

function voterIp(): string {
  // The dev server has no Cloudflare in front, and counts everyone as one voter.
  return getRequestHeader("cf-connecting-ip") ?? "local";
}

/** The day's rounds: each clip with its poster and length, without its rank. */
export const getDailyRounds = createServerFn({ method: "GET" })
  .validator((input: { date: string }) => ({ date: requireDate(input as unknown as Record<string, unknown>) }))
  .handler(async ({ data, context }): Promise<DailyRound[]> =>
    toDailyRounds(await dailyVideos(context.env, data.date)),
  );

/** Records a guess (once per voter and clip) and answers with the rank and the community's guesses. */
export const submitGuess = createServerFn({ method: "POST" })
  .validator((input: RoundInput & { tier: number }) => {
    const round = validateRoundInput(input);
    const { tier } = input;
    if (typeof tier !== "number" || !Number.isInteger(tier)) throw new Error("Invalid tier");
    return { ...round, tier };
  })
  .handler(async ({ data, context }): Promise<RoundResult> => {
    const db = context.env?.GUESS_THE_RANK_DB;
    if (!db) throw new Error("Guess the Rank is not available here");
    if (!(await validTiers()).has(data.tier)) throw new Error("Invalid tier");
    const video = await roundVideo(context.env, data);
    return recordVote(db, video, await voterHash(voterIp(), video.id), data.tier, cache);
  });

/** A round's answer with fresh stats, for a voter who already guessed it; null (no rank) for anyone else. */
export const getRoundResult = createServerFn({ method: "GET" })
  .validator(validateRoundInput)
  .handler(async ({ data, context }): Promise<RoundResult | null> => {
    const db = context.env?.GUESS_THE_RANK_DB;
    if (!db) return null;
    const video = await roundVideo(context.env, data);
    return readResult(db, video, await voterHash(voterIp(), video.id), cache);
  });
