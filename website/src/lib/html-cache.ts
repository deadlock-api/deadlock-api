/**
 * Edge cache for the server-rendered HTML of the analytics and community pages. They used to be prerendered; since
 * they render per request (URL filters, the preferences cookie, fresh numbers), every visit waited for the Worker to
 * run the route loaders against the API before the first byte. This keeps each rendered page in the Worker's Cache API
 * and answers from it: fresh for `FRESH_SECONDS`, then served stale while one background render replaces it, up to
 * `STALE_SECONDS`.
 *
 * The key is everything the server render reads: the build, the full URL with its query, the `preferences` cookie
 * and, on the leaderboard, the region the request's country or language picks. Nothing else a request carries
 * reaches the server render (experiments render "control" on the server, patron auth runs in the browser); a new
 * `getRequestHeader` in a loader must be added to the key here.
 */
import { parsePreferencesCookie } from "~/lib/preferences";
import { regionForRequest } from "~/lib/region";

/** The API's own `max-age` for analytics responses: a page this young shows the numbers a fresh render would. */
export const FRESH_SECONDS = 600;
/**
 * Most of these URLs (filter combinations) are loaded a few times a day, so a short window would miss almost always.
 * A stale page shows one visitor numbers up to a day old while its refresh runs; a deploy (a new patch included)
 * changes the build id and drops them all.
 */
export const STALE_SECONDS = 86_400;

/** The response header that tells how the page was served: HIT, STALE (a refresh runs behind it) or MISS. */
export const CACHE_STATUS_HEADER = "x-html-cache";
const STORED_AT_HEADER = "x-html-cache-stored-at";

const CACHEABLE_PATH = /^\/(analytics|community)(\/|$)/;
const REGION_PATH = /^\/community\/leaderboard(\/|$)/;

export type CacheStatus = "HIT" | "STALE" | "MISS";

export interface HtmlCacheOptions {
  cache: Cache;
  /** Renders the page; its response is stored only if it is a plain 200 HTML page with no caching policy of its own. */
  render: (request: Request) => Promise<Response> | Response;
  /** Adds the headers every served page carries (security headers, the browser's Cache-Control). */
  finalize: (response: Response) => Response;
  waitUntil: (promise: Promise<unknown>) => void;
  /** Changes with every build, so a cached page never points at hashed assets a later deploy removed. */
  buildId: string;
  now?: () => number;
}

export function isCacheableRequest(request: Request): boolean {
  return request.method === "GET" && CACHEABLE_PATH.test(new URL(request.url).pathname);
}

export function htmlCacheKey(request: Request, buildId: string): Request {
  const url = new URL(request.url);
  const preferences = parsePreferencesCookie(request.headers.get("cookie") ?? "");
  const sorted = Object.fromEntries(Object.entries(preferences).sort(([a], [b]) => a.localeCompare(b)));
  const variant = new URLSearchParams({ build: buildId, preferences: JSON.stringify(sorted) });
  if (REGION_PATH.test(url.pathname)) {
    variant.set(
      "region",
      regionForRequest(
        request.headers.get("cf-ipcountry") ?? undefined,
        request.headers.get("accept-language") ?? undefined,
      ),
    );
  }
  // A path of its own, so no key can ever equal a real page URL.
  return new Request(
    `${url.origin}/__html-cache/${encodeURIComponent(variant.toString())}${url.pathname}${url.search}`,
  );
}

function isStorable(response: Response): boolean {
  return (
    response.status === 200 &&
    !!response.headers.get("content-type")?.toLowerCase().includes("text/html") &&
    !response.headers.has("set-cookie") &&
    !response.headers.has("cache-control")
  );
}

function toStored(response: Response, now: number): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", `public, max-age=${STALE_SECONDS}`);
  headers.set(STORED_AT_HEADER, String(now));
  // The key already carries every variant; the Cache API must not split or refuse entries on the served Vary.
  headers.delete("Vary");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function toServed(response: Response, status: CacheStatus, ageSeconds?: number): Response {
  const headers = new Headers(response.headers);
  headers.delete(STORED_AT_HEADER);
  headers.delete("CF-Cache-Status");
  // The browser must still revalidate every time: the edge copy is the one that may be reused, not the browser's.
  headers.set("Cache-Control", "private, max-age=0, must-revalidate");
  headers.set("Vary", "Cookie");
  headers.set(CACHE_STATUS_HEADER, status);
  // Readable from the page (PerformanceNavigationTiming.serverTiming), so analytics can tag web vitals with it.
  headers.append("Server-Timing", `html-cache;desc=${status}`);
  if (ageSeconds !== undefined) headers.set("Age", String(ageSeconds));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/** Keys being re-rendered in the background by this isolate, so a burst of stale hits starts one render, not many. */
const refreshing = new Set<string>();

async function renderAndStore(
  request: Request,
  key: Request,
  options: HtmlCacheOptions,
): Promise<{ response: Response; stored: boolean }> {
  const now = options.now ?? Date.now;
  const rendered = await options.render(request);
  const stored = isStorable(rendered);
  const response = options.finalize(rendered);
  if (!stored) return { response, stored };
  options.waitUntil(options.cache.put(key, toStored(response.clone(), now())).catch(() => undefined));
  return { response, stored };
}

export async function serveCachedHtml(request: Request, options: HtmlCacheOptions): Promise<Response> {
  const now = options.now ?? Date.now;
  const key = htmlCacheKey(request, options.buildId);
  const cached = await options.cache.match(key).catch(() => undefined);
  if (cached) {
    const storedAt = Number(cached.headers.get(STORED_AT_HEADER));
    const age = Number.isFinite(storedAt) ? Math.max(0, Math.floor((now() - storedAt) / 1000)) : STALE_SECONDS;
    if (age < STALE_SECONDS) {
      if (age < FRESH_SECONDS) return toServed(cached, "HIT", age);
      if (!refreshing.has(key.url)) {
        refreshing.add(key.url);
        options.waitUntil(
          renderAndStore(new Request(request), key, options)
            .then(({ response }) => response.body?.cancel())
            .catch(() => undefined)
            .finally(() => refreshing.delete(key.url)),
        );
      }
      return toServed(cached, "STALE", age);
    }
  }
  const { response, stored } = await renderAndStore(request, key, options);
  // A page that is not stored (an error, a 404, a route with its own caching policy) goes out as rendered.
  return stored ? toServed(response, "MISS") : response;
}
