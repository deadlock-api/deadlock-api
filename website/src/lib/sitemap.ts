import type { Upgrade } from "deadlock_api_client";

import { day } from "~/dayjs";
import { ANALYTICS_TABS } from "~/lib/analytics-tabs";
import { api } from "~/lib/api";
import { fetchPatchList } from "~/lib/patch-list-fns";
import { INDEXED_PATCHES, isSettled, patchWindows } from "~/lib/patches";

import { isPlayableHero } from "./hero-roster";
import { heroSlug } from "./hero-slug";
import { isShopableItem } from "./item-roster";
import { itemSlug } from "./item-slug";
import { SITE_URL } from "./seo";

// Google ignores changefreq and priority, and trusts lastmod only while it is accurate: it is set only where a real
// date exists (blog front matter), never by hand.
export interface SitemapEntry {
  path: string;
  lastmod?: string;
}

const STATIC_ENTRIES: SitemapEntry[] = [
  { path: "/" },
  { path: "/analytics/heroes" },
  { path: "/analytics/items" },
  { path: "/analytics/abilities" },
  { path: "/community/leaderboard" },
  { path: "/community/badge-distribution" },
  { path: "/analytics/games" },
  { path: "/community/heatmap" },
  { path: "/analytics/players" },
  { path: "/tracker" },
  { path: "/tracker/demo" },
  { path: "/analytics/team-builder" },
  { path: "/streamkit" },
  { path: "/data-privacy" },
  { path: "/ingest-cache" },
  { path: "/games/deadlockdle" },
  { path: "/games/deadlockdle/guess-hero" },
  { path: "/games/deadlockdle/guess-item" },
  { path: "/games/deadlockdle/guess-sound" },
  { path: "/games/deadlockdle/guess-ability" },
  { path: "/games/deadlockdle/item-stats" },
  { path: "/games/deadlockdle/trivia" },
  { path: "/games/deadlockdle/higher-lower" },
  { path: "/games/flashcards" },
  { path: "/games/flashcards/heroes" },
  { path: "/games/flashcards/items" },
  { path: "/games/flashcards/item-effects" },
  { path: "/games/flashcards/item-upgrades" },
  { path: "/data-dumps" },
  { path: "/crosshair" },
  { path: "/sounds" },
];

const ANALYTICS_VIEW_ENTRIES: SitemapEntry[] = Object.entries(ANALYTICS_TABS).flatMap(([section, tabs]) =>
  Object.values(tabs)
    .filter(Boolean)
    .map((view) => ({ path: `/analytics/${section}/${view}` })),
);

// Load blog markdown files from content/blog/ at build time via Vite glob.
const blogModules = import.meta.glob<string>("../../content/blog/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
});

interface BlogFrontmatter {
  date?: string;
}

function parseBlogFrontmatter(raw: string): BlogFrontmatter {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const meta: BlogFrontmatter = {};
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kv?.[1] === "date") meta.date = kv[2].trim();
  }
  return meta;
}

interface BlogEntry {
  slug: string;
  date?: string;
}

function loadBlogEntries(): BlogEntry[] {
  const entries: BlogEntry[] = [];
  for (const [path, raw] of Object.entries(blogModules)) {
    const slug = path.replace(/^.*\/blog\//, "").replace(/\.md$/, "");
    entries.push({ slug, date: parseBlogFrontmatter(raw).date });
  }
  return entries.sort((a, b) => a.slug.localeCompare(b.slug));
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
      default:
        return c;
    }
  });
}

function renderUrl(entry: SitemapEntry): string {
  const parts = [`<loc>${escapeXml(`${SITE_URL}${entry.path}`)}</loc>`];
  if (entry.lastmod) parts.push(`<lastmod>${entry.lastmod}</lastmod>`);
  return `  <url>${parts.join("")}</url>`;
}

/**
 * The sitemap is prerendered once per build and then served as a static file, so an API failure here would ship a
 * sitemap without its ~200 hero and item pages until the next deploy. Retry, then fail the build loudly instead.
 */
async function withRetries<T>(what: string, load: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await load();
    } catch (error) {
      if (attempt >= attempts) throw new Error(`Sitemap: fetching ${what} failed ${attempts} times`, { cause: error });
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
}

async function loadHeroEntries(): Promise<SitemapEntry[]> {
  const response = await withRetries("heroes", () => api.heroes_api.listHeroes({ onlyActive: true }));
  return response.data.filter(isPlayableHero).map((hero) => ({
    path: `/analytics/heroes/${heroSlug(hero.name)}`,
  }));
}

async function loadItemEntries(): Promise<SitemapEntry[]> {
  const response = await withRetries("items", () => api.items_api.getItemsByType({ type: "upgrade" }));
  return (response.data as Upgrade[]).filter(isShopableItem).map((item) => ({
    path: `/analytics/items/${itemSlug(item.name)}`,
  }));
}

/**
 * `/patches` shows the newest patch, and the next few have pages of their own; older ones are not indexed yet. A
 * patch's numbers stop changing once its after window closes, which is its lastmod.
 */
async function loadPatchEntries(): Promise<SitemapEntry[]> {
  const patches = await fetchPatchList();
  const lastmod = (index: number) => {
    const windows = patchWindows(patches[index], patches[index + 1]);
    return isSettled(windows, Date.now() / 1000)
      ? day.unix(windows.after.maxUnixTimestamp).utc().format("YYYY-MM-DD")
      : undefined;
  };
  return [
    { path: "/patches", lastmod: patches.length > 0 ? lastmod(0) : undefined },
    ...patches.slice(1, INDEXED_PATCHES).map((patch, index) => ({
      path: `/patches/${patch.id}`,
      lastmod: lastmod(index + 1),
    })),
  ];
}

export async function buildSitemapXml(): Promise<string> {
  const blogEntries: SitemapEntry[] = loadBlogEntries().map((post) => ({
    path: `/blog/${post.slug}`,
    lastmod: post.date,
  }));
  const blogIndex: SitemapEntry = {
    path: "/blog",
    lastmod: blogEntries
      .flatMap((post) => post.lastmod ?? [])
      .sort()
      .at(-1),
  };
  const [heroEntries, itemEntries, patchEntries] = await Promise.all([
    loadHeroEntries(),
    loadItemEntries(),
    loadPatchEntries(),
  ]);
  const all = [
    ...STATIC_ENTRIES,
    ...ANALYTICS_VIEW_ENTRIES,
    blogIndex,
    ...blogEntries,
    ...heroEntries,
    ...itemEntries,
    ...patchEntries,
  ];
  const body = all.map(renderUrl).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export function buildSitemapIndexXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <sitemap>\n    <loc>${SITE_URL}/sitemap.xml</loc>\n  </sitemap>\n</sitemapindex>\n`;
}
