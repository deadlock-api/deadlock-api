import type { RateLimiter } from "~/lib/worker-env";

import { QUESTIONS_PER_MINUTE } from "./limits";

// How many questions one visitor may ask the model: `QUESTIONS_PER_MINUTE` per IP address. The Worker counts with its
// `AI_SEARCH_RATE_LIMITER` binding; the Vite dev server, which has none, counts here.

const WINDOW_MS = 60_000;

const asked = new Map<string, number[]>();

function allowInMemory(key: string, now: number): boolean {
  const recent = (asked.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
  const allowed = recent.length < QUESTIONS_PER_MINUTE;
  if (allowed) recent.push(now);
  asked.set(key, recent);
  return allowed;
}

/** Whether the visitor at `ip` may ask another question now; asking counts against the limit. */
export async function allowQuestion(ip: string, limiter: RateLimiter | undefined, now = Date.now()): Promise<boolean> {
  if (limiter) return (await limiter.limit({ key: ip })).success;
  return allowInMemory(ip, now);
}
