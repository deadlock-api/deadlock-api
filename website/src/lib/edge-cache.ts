// A small JSON cache over the Workers Cache API, in front of reads that cost money per call (D1 rows, R2 listings).
// Each Cloudflare location keeps its own copy, shared by every isolate there, so a burst of requests (or someone
// spamming an endpoint) reads the database about once per key and TTL per location. Under the Vite dev server and in
// tests there is no Cache API and every read goes through.

export interface JsonCache {
  /** The stored value, or undefined on a miss (a stored `null` is a hit). */
  get<T>(key: string): Promise<{ value: T } | undefined>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
}

/** Caches nothing. */
export const NO_CACHE: JsonCache = {
  get: async () => undefined,
  set: async () => undefined,
};

/** A path of its own on a fixed origin, so no key can ever equal a real page URL. */
const KEY_ORIGIN = "https://deadlock-api.com/__edge-cache/";

function cacheApiJsonCache(open: () => Promise<Cache>): JsonCache {
  let opened: Promise<Cache> | undefined;
  const cache = () => (opened ??= open());
  return {
    async get<T>(key: string) {
      const hit = await (await cache()).match(KEY_ORIGIN + key).catch(() => undefined);
      if (!hit) return undefined;
      return { value: (await hit.json()) as T };
    },
    async set(key, value, ttlSeconds) {
      const response = new Response(JSON.stringify(value), {
        headers: { "content-type": "application/json", "cache-control": `public, max-age=${ttlSeconds}` },
      });
      // A failed write only costs the next request a database read.
      await (await cache()).put(KEY_ORIGIN + key, response).catch(() => undefined);
    },
  };
}

/** The Cache API cache `name` of this location, or `NO_CACHE` where there is none. */
export function edgeCache(name: string): JsonCache {
  if (typeof caches === "undefined") return NO_CACHE;
  return cacheApiJsonCache(() => caches.open(name));
}

/** `load()`'s value, read from `cache` under `key` when it is younger than `ttlSeconds`. */
export async function cachedJson<T>(
  cache: JsonCache,
  key: string,
  ttlSeconds: number,
  load: () => Promise<T>,
): Promise<T> {
  const hit = await cache.get<T>(key);
  if (hit) return hit.value;
  const value = await load();
  await cache.set(key, value, ttlSeconds);
  return value;
}
