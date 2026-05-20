#!/usr/bin/env node
/**
 * Merge currently-live hashed assets into the fresh build so users with stale
 * HTML (open mobile tabs, BFCache) can still load chunks referenced by the
 * previous deploy. Vite content-hashes every chunk, so old + new can coexist.
 *
 * Runs as a post-build step. Failures are logged but never abort the deploy:
 * the runtime auto-reload handler (src/lib/chunk-reload.ts) is the final
 * safety net.
 */
import { mkdir, readdir, writeFile, access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = process.env.PRESERVE_ASSETS_ORIGIN ?? "https://deadlock-api.com";
const scriptDir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(scriptDir, "..");
const DIST_ASSETS = join(ROOT, "dist", "client", "assets");
const CONCURRENCY = 8;
const MAX_PAGES = 60;

const CHUNK_REGEX = /\/assets\/([A-Za-z0-9._-]+\.(?:js|css|woff2?|map))/g;

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

async function crawl() {
  const queue = ["/"];
  const seenPages = new Set();
  const assets = new Set();

  while (queue.length && seenPages.size < MAX_PAGES) {
    const path = queue.shift();
    if (seenPages.has(path)) continue;
    seenPages.add(path);

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
  const existing = new Set(await readdir(DIST_ASSETS));

  let liveAssets;
  try {
    liveAssets = await crawl();
  } catch (err) {
    console.warn(`[preserve-old-assets] crawl failed: ${err.message}. Skipping.`);
    return;
  }

  const missing = [...liveAssets].filter((a) => !existing.has(a));
  if (missing.length === 0) {
    console.log("[preserve-old-assets] no stale chunks to backfill.");
    return;
  }

  console.log(`[preserve-old-assets] backfilling ${missing.length} chunk(s) from ${SITE}`);
  let saved = 0;
  let failed = 0;
  for (let i = 0; i < missing.length; i += CONCURRENCY) {
    const batch = missing.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (name) => {
        const bytes = await fetchBytes(`${SITE}/assets/${name}`);
        if (!bytes) return false;
        await mkdir(DIST_ASSETS, { recursive: true });
        await writeFile(join(DIST_ASSETS, name), bytes);
        return true;
      }),
    );
    for (const ok of results) if (ok) saved += 1; else failed += 1;
  }
  console.log(`[preserve-old-assets] saved=${saved} failed=${failed}`);
}

main().catch((err) => {
  console.warn(`[preserve-old-assets] unexpected error: ${err.message}. Continuing.`);
});
