#!/usr/bin/env node
/**
 * Carry earlier deploys' hashed assets into the fresh build, so HTML rendered by an earlier build can still load its
 * chunks: open tabs, BFCache, and pages the Worker's HTML cache (src/lib/html-cache.ts) serves stale across deploys.
 * Vite content-hashes every chunk, so old and new coexist.
 *
 * Every deploy publishes `asset-history.json`: the builds whose complete asset sets it serves, each with its assets and
 * the last time it was live. The next build fetches it and carries every build live within `RETENTION_MS`, oldest
 * dropped first past `MAX_ASSETS`; a build with an asset that fails to download is left out whole. The Worker serves a
 * cached page of another build only when this deploy's history lists that build, so a missed carry or a rollback costs
 * a cache miss, never a page without its scripts. Without a live history (the first deploy, or the fetch failed) a
 * crawl of the live pages carries what they reference, for open tabs, but no earlier build is listed.
 *
 * The build id comes from `annotation-manifest.json` (plugins/annotate-source.mjs), the same id the Worker stamps on
 * its cached pages. Runs as a post-build step. Failures are logged but never abort the deploy: the runtime auto-reload
 * handler (src/lib/chunk-reload.ts) is the final safety net.
 */
import { access, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = process.env.PRESERVE_ASSETS_ORIGIN ?? "https://deadlock-api.com";
const scriptDir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(scriptDir, "..");
const CLIENT = join(ROOT, "dist", "client");
const DIST_ASSETS = join(CLIENT, "assets");
const HISTORY_FILE = "asset-history.json";
// Googlebot renders pages days after fetching them: at 3 days it got a 404 for ~9% of its chunk requests, all from
// builds already dropped. With a dozen deploys a day, MAX_ASSETS is what usually ends the window.
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
// Workers Static Assets allows 20,000 files per version on the Free plan.
const MAX_ASSETS = 15_000;
const CONCURRENCY = 16;
const MAX_PAGES = 60;

const CHUNK_REGEX = /\/assets\/([A-Za-z0-9._-]+\.(?:js|css|woff2?|map))/g;
const ASSET_NAME = /^[A-Za-z0-9._-]+$/;

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function fetchText(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) return null;
  return res.text();
}

async function fetchBytes(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

function extractAssets(text) {
  const found = new Set();
  let m;
  while ((m = CHUNK_REGEX.exec(text)) !== null) found.add(m[1]);
  return found;
}

/**
 * The live deploy's history, `{ current, builds: { [id]: { usedAt, assets } } }`, or null when it has none (404) or it
 * cannot be read.
 */
async function liveHistory() {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- retries run one after another
      const res = await fetch(`${SITE}/${HISTORY_FILE}?t=${Date.now()}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // oxlint-disable-next-line no-await-in-loop -- retries run one after another
      const text = await res.text();
      let history;
      try {
        history = JSON.parse(text);
      } catch {
        history = undefined;
      }
      // A real history always lists the build that published it; anything else is not one.
      if (typeof history?.current !== "string" || !history.builds?.[history.current]) {
        const type = res.headers.get("content-type");
        console.warn(
          `[preserve-old-assets] no history: HTTP ${res.status} ${type} ${JSON.stringify(text.slice(0, 80))}`,
        );
        return null;
      }
      const builds = Object.entries(history?.builds ?? {}).filter(
        ([id, build]) =>
          Number.isFinite(build?.usedAt) &&
          Array.isArray(build?.assets) &&
          build.assets.every((name) => typeof name === "string" && ASSET_NAME.test(name)) &&
          id.length > 0,
      );
      return { current: history.current, builds: Object.fromEntries(builds) };
    } catch (err) {
      console.warn(`[preserve-old-assets] history attempt ${attempt} failed: ${err.message}`);
    }
  }
  return null;
}

async function download(names, have) {
  let failed = 0;
  const todo = names.filter((name) => !have.has(name));
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    const batch = todo.slice(i, i + CONCURRENCY);
    // oxlint-disable-next-line no-await-in-loop -- intentional backpressure between batches
    const results = await Promise.all(
      batch.map(async (name) => {
        const bytes = await fetchBytes(`${SITE}/assets/${name}`).catch(() => null);
        if (!bytes) return false;
        await writeFile(join(DIST_ASSETS, name), bytes);
        have.add(name);
        return true;
      }),
    );
    failed += results.filter((ok) => !ok).length;
  }
  return failed;
}

async function crawl() {
  const queue = ["/"];
  const seenPages = new Set();
  const assets = new Set();

  while (queue.length && seenPages.size < MAX_PAGES) {
    const path = queue.shift();
    if (seenPages.has(path)) continue;
    seenPages.add(path);

    // oxlint-disable-next-line no-await-in-loop -- queue grows dynamically as we crawl
    const html = await fetchText(SITE + path);
    if (!html) continue;
    for (const a of extractAssets(html)) assets.add(a);

    // also crawl a handful of internal links to surface route chunks
    const linkRe = /href="(\/[a-zA-Z0-9/_-]*)"/g;
    let lm;
    while ((lm = linkRe.exec(html)) !== null) {
      const next = lm[1];
      if (next.startsWith("/assets")) continue;
      if (!seenPages.has(next) && queue.length + seenPages.size < MAX_PAGES) {
        queue.push(next);
      }
    }
  }

  // For each .js file, also fetch it and extract referenced lazy chunks.
  // Lazy chunks live as string literals inside parent bundles.
  const initialJs = [...assets].filter((a) => a.endsWith(".js"));
  for (let i = 0; i < initialJs.length; i += CONCURRENCY) {
    const batch = initialJs.slice(i, i + CONCURRENCY);
    // oxlint-disable-next-line no-await-in-loop -- intentional backpressure between batches
    const texts = await Promise.all(batch.map((name) => fetchText(`${SITE}/assets/${name}`)));
    for (const t of texts) {
      if (!t) continue;
      for (const a of extractAssets(t)) assets.add(a);
    }
  }
  return assets;
}

async function main() {
  if (!(await exists(DIST_ASSETS))) {
    console.warn(`[preserve-old-assets] ${DIST_ASSETS} missing, skipping.`);
    return;
  }
  const { buildId } = JSON.parse(await readFile(join(CLIENT, "annotation-manifest.json"), "utf8"));
  if (typeof buildId !== "string" || !buildId) throw new Error("annotation-manifest.json has no buildId");
  const now = Date.now();
  const built = await readdir(DIST_ASSETS);
  const have = new Set(built);
  const builds = { [buildId]: { usedAt: now, assets: built } };

  const live = await liveHistory();
  if (live) {
    // The build live until now was used until now; the others were last used when the next one replaced them.
    const candidates = Object.entries(live.builds)
      .filter(([id]) => id !== buildId)
      .map(([id, build]) => [id, { ...build, usedAt: id === live.current ? now : build.usedAt }])
      .filter(([, build]) => now - build.usedAt < RETENTION_MS)
      .sort(([, a], [, b]) => b.usedAt - a.usedAt);
    let dropped = 0;
    for (const [id, build] of candidates) {
      const extra = build.assets.filter((name) => !have.has(name)).length;
      if (have.size + extra > MAX_ASSETS) {
        dropped += 1;
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- one build at a time keeps the cap exact
      const failed = await download(build.assets, have);
      if (failed) console.warn(`[preserve-old-assets] build ${id}: ${failed} asset(s) failed, not listed`);
      else builds[id] = build;
    }
    console.log(
      `[preserve-old-assets] build=${buildId} carried=${Object.keys(builds).length - 1} dropped=${dropped} files=${have.size}`,
    );
  } else {
    try {
      const failed = await download([...(await crawl())], have);
      console.log(`[preserve-old-assets] no history, crawl carried ${have.size - built.length} (failed=${failed})`);
    } catch (err) {
      console.warn(`[preserve-old-assets] crawl failed: ${err.message}`);
    }
  }
  await writeFile(join(CLIENT, HISTORY_FILE), JSON.stringify({ current: buildId, builds }));
}

main().catch((err) => {
  console.warn(`[preserve-old-assets] unexpected error: ${err.message}. Continuing.`);
});
