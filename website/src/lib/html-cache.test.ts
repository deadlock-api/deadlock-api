import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CACHE_STATUS_HEADER,
  FRESH_SECONDS,
  htmlCacheKey,
  isCacheableRequest,
  serveCachedHtml,
  STALE_SECONDS,
  type HtmlCacheOptions,
} from "./html-cache";

/** The two Cache methods the HTML cache uses, over a Map. */
function memoryCache() {
  const entries = new Map<string, Response>();
  const cache = {
    async match(key: Request) {
      return entries.get(key.url)?.clone();
    },
    async put(key: Request, response: Response) {
      entries.set(key.url, new Response(await response.arrayBuffer(), response));
    },
  } as unknown as Cache;
  return { cache, entries };
}

function setup(renderResponse: () => Response = () => html("page")) {
  const { cache, entries } = memoryCache();
  const pending: Promise<unknown>[] = [];
  let clock = 1_000_000;
  let renders = 0;
  let served: ReadonlySet<string> = new Set(["b1"]);
  const options: HtmlCacheOptions = {
    cache,
    render: async () => {
      renders += 1;
      return renderResponse();
    },
    finalize: (res) => res,
    waitUntil: (promise) => void pending.push(promise),
    buildId: "b1",
    servedBuilds: async () => served,
    now: () => clock,
  };
  return {
    options,
    entries,
    renders: () => renders,
    advance: (seconds: number) => void (clock += seconds * 1000),
    settle: () => Promise.all(pending.splice(0)),
    serve: (...builds: string[]) => void (served = new Set(builds)),
  };
}

function html(body: string, status = 200, headers: Record<string, string> = {}) {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", ...headers } });
}

const page = (path = "/analytics/heroes", headers: Record<string, string> = {}) =>
  new Request(`https://deadlock-api.com${path}`, { headers });

test("only GET requests for analytics and community pages are cached", () => {
  assert.ok(isCacheableRequest(page("/analytics")));
  assert.ok(isCacheableRequest(page("/analytics/heroes/haze?min_rank=91")));
  assert.ok(isCacheableRequest(page("/community/leaderboard")));
  assert.ok(!isCacheableRequest(page("/")));
  assert.ok(!isCacheableRequest(page("/analyticsx")));
  assert.ok(!isCacheableRequest(page("/tracker")));
  assert.ok(!isCacheableRequest(page("/players/123")));
  assert.ok(!isCacheableRequest(new Request("https://deadlock-api.com/analytics", { method: "HEAD" })));
});

test("the key separates queries and preferences, and ignores other cookies", () => {
  const key = (request: Request) => htmlCacheKey(request).url;
  assert.notEqual(key(page()), key(page("/analytics/heroes?min_rank=91")));
  const patch = { cookie: `preferences=${encodeURIComponent('{"dateFilter":"patch"}')}` };
  assert.notEqual(key(page()), key(page("/analytics/heroes", patch)));
  assert.equal(key(page()), key(page("/analytics/heroes", { cookie: "other=1; preferences=%7B%7D" })));
  assert.equal(
    key(page("/analytics/heroes", { cookie: `preferences=${encodeURIComponent('{"b":1,"a":2}')}` })),
    key(page("/analytics/heroes", { cookie: `preferences=${encodeURIComponent('{"a":2,"b":1}')}` })),
  );
});

test("the leaderboard key carries the request's region, other pages do not", () => {
  const key = (path: string, headers: Record<string, string>) => htmlCacheKey(page(path, headers)).url;
  assert.notEqual(
    key("/community/leaderboard", { "cf-ipcountry": "US" }),
    key("/community/leaderboard", { "cf-ipcountry": "DE" }),
  );
  assert.equal(
    key("/community/leaderboard", { "cf-ipcountry": "DE" }),
    key("/community/leaderboard", { "cf-ipcountry": "FR" }),
  );
  assert.equal(key("/analytics/heroes", { "cf-ipcountry": "US" }), key("/analytics/heroes", { "cf-ipcountry": "DE" }));
});

test("a stored page is a hit while fresh, stale with one background render after, and re-rendered once expired", async () => {
  const t = setup();
  const miss = await serveCachedHtml(page(), t.options);
  assert.equal(miss.headers.get(CACHE_STATUS_HEADER), "MISS");
  assert.equal(await miss.text(), "page");
  await t.settle();

  t.advance(FRESH_SECONDS - 1);
  const hit = await serveCachedHtml(page(), t.options);
  assert.equal(hit.headers.get(CACHE_STATUS_HEADER), "HIT");
  assert.equal(hit.headers.get("cache-control"), "private, max-age=0, must-revalidate");
  assert.equal(hit.headers.get("x-html-cache-stored-at"), null);
  assert.equal(await hit.text(), "page");
  assert.equal(t.renders(), 1);

  t.advance(2);
  const [stale, again] = await Promise.all([serveCachedHtml(page(), t.options), serveCachedHtml(page(), t.options)]);
  assert.equal(stale.headers.get(CACHE_STATUS_HEADER), "STALE");
  assert.equal(again.headers.get(CACHE_STATUS_HEADER), "STALE");
  await t.settle();
  assert.equal(t.renders(), 2, "two stale hits start one refresh");
  assert.equal((await serveCachedHtml(page(), t.options)).headers.get(CACHE_STATUS_HEADER), "HIT");

  t.advance(STALE_SECONDS);
  assert.equal((await serveCachedHtml(page(), t.options)).headers.get(CACHE_STATUS_HEADER), "MISS");
  assert.equal(t.renders(), 3);
});

test("a page an earlier build rendered is served stale while this build re-renders it", async () => {
  const t = setup();
  await serveCachedHtml(page(), t.options);
  await t.settle();

  t.advance(1);
  t.options.buildId = "b2";
  t.serve("b2", "b1");
  const stale = await serveCachedHtml(page(), t.options);
  assert.equal(stale.headers.get(CACHE_STATUS_HEADER), "STALE");
  assert.equal(stale.headers.get("x-html-cache-build"), null);
  await t.settle();
  assert.equal(t.renders(), 2);
  assert.equal((await serveCachedHtml(page(), t.options)).headers.get(CACHE_STATUS_HEADER), "HIT");
});

test("a page of a build this deploy does not serve the assets of is rendered again", async () => {
  // A rollback to b0, or a deploy that could not carry b1's assets.
  const t = setup();
  await serveCachedHtml(page(), t.options);
  await t.settle();

  t.options.buildId = "b0";
  t.serve("b0");
  assert.equal((await serveCachedHtml(page(), t.options)).headers.get(CACHE_STATUS_HEADER), "MISS");
  await t.settle();
  assert.equal(t.renders(), 2);
  assert.equal((await serveCachedHtml(page(), t.options)).headers.get(CACHE_STATUS_HEADER), "HIT");

  // The served builds cannot be read: only this build's own pages are reused.
  t.options.buildId = "b1";
  t.options.servedBuilds = () => Promise.reject(new Error("offline"));
  assert.equal((await serveCachedHtml(page(), t.options)).headers.get(CACHE_STATUS_HEADER), "MISS");
});

test("an earlier build's page past the stale window is rendered again", async () => {
  const t = setup();
  await serveCachedHtml(page(), t.options);
  await t.settle();
  t.advance(STALE_SECONDS);
  t.options.buildId = "b2";
  t.serve("b2", "b1");
  assert.equal((await serveCachedHtml(page(), t.options)).headers.get(CACHE_STATUS_HEADER), "MISS");
});

test("errors, redirects, cookies and pages with their own caching policy go out as rendered and are not stored", async () => {
  const responses = [
    () => html("missing", 404),
    () => html("down", 500),
    () => new Response(null, { status: 307, headers: { location: "/analytics" } }),
    () => html("session", 200, { "set-cookie": "a=1" }),
    () => html("own", 200, { "cache-control": "no-store" }),
    () => new Response("{}", { headers: { "content-type": "application/json" } }),
  ];
  await Promise.all(
    responses.map(async (response) => {
      const t = setup(response);
      const served = await serveCachedHtml(page(), t.options);
      await t.settle();
      assert.equal(served.headers.get(CACHE_STATUS_HEADER), null);
      assert.equal(t.entries.size, 0);
    }),
  );
});
