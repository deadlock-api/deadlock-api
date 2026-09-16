import type { Upgrade } from "deadlock_api_client";

import { ANALYTICS_TABS } from "~/lib/analytics-tabs";
import { api } from "~/lib/api";
import { filterPlayableHeroes, filterShopableItems } from "~/queries/asset-queries";

import { heroSlug } from "./hero-slug";
import { itemSlug } from "./item-slug";
import { SITE_URL } from "./seo";

export interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number;
}

const STATIC_ENTRIES: SitemapEntry[] = [
  { path: "/", lastmod: "2026-05-06", changefreq: "weekly", priority: 1.0 },
  { path: "/analytics/heroes", changefreq: "daily", priority: 0.9 },
  { path: "/analytics/items", changefreq: "daily", priority: 0.9 },
  { path: "/analytics/abilities", changefreq: "daily", priority: 0.8 },
  { path: "/community/leaderboard", changefreq: "daily", priority: 0.8 },
  { path: "/community/badge-distribution", changefreq: "weekly", priority: 0.7 },
  { path: "/analytics/games", changefreq: "daily", priority: 0.7 },
  { path: "/community/heatmap", changefreq: "weekly", priority: 0.7 },
  { path: "/analytics/players", changefreq: "daily", priority: 0.7 },
  { path: "/tracker", changefreq: "weekly", priority: 0.7 },
  { path: "/analytics/team-builder", changefreq: "weekly", priority: 0.7 },
  { path: "/streamkit", lastmod: "2026-03-12", changefreq: "monthly", priority: 0.6 },
  { path: "/data-privacy", lastmod: "2026-03-22", changefreq: "monthly", priority: 0.5 },
  { path: "/ingest-cache", lastmod: "2026-03-10", changefreq: "monthly", priority: 0.6 },
  { path: "/games/deadlockdle", changefreq: "daily", priority: 0.8 },
  { path: "/games/deadlockdle/guess-hero", changefreq: "weekly", priority: 0.6 },
  { path: "/games/deadlockdle/guess-item", changefreq: "weekly", priority: 0.6 },
  { path: "/games/deadlockdle/guess-sound", changefreq: "weekly", priority: 0.6 },
  { path: "/games/deadlockdle/guess-ability", changefreq: "weekly", priority: 0.6 },
  { path: "/games/deadlockdle/item-stats", changefreq: "weekly", priority: 0.6 },
  { path: "/games/deadlockdle/trivia", changefreq: "weekly", priority: 0.6 },
  { path: "/games/flashcards", changefreq: "weekly", priority: 0.6 },
  { path: "/games/flashcards/heroes", changefreq: "weekly", priority: 0.6 },
  { path: "/games/flashcards/items", changefreq: "weekly", priority: 0.6 },
  { path: "/games/flashcards/item-effects", changefreq: "weekly", priority: 0.6 },
  { path: "/games/flashcards/item-upgrades", changefreq: "weekly", priority: 0.6 },
  { path: "/data-dumps", changefreq: "weekly", priority: 0.6 },
];

const ANALYTICS_VIEW_ENTRIES: SitemapEntry[] = Object.entries(ANALYTICS_TABS).flatMap(([section, tabs]) =>
  Object.values(tabs)
    .filter(Boolean)
    .map((view) => ({
      path: `/analytics/${section}/${view}`,
      changefreq: "daily" as const,
      priority: 0.7,
    })),
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
  if (entry.changefreq) parts.push(`<changefreq>${entry.changefreq}</changefreq>`);
  if (entry.priority !== undefined) parts.push(`<priority>${entry.priority.toFixed(1)}</priority>`);
  return `  <url>${parts.join("")}</url>`;
}

async function loadHeroEntries(): Promise<SitemapEntry[]> {
  try {
    const response = await api.heroes_api.listHeroes({ onlyActive: true });
    return filterPlayableHeroes(response.data).map((hero) => ({
      path: `/analytics/heroes/${heroSlug(hero.name)}`,
      changefreq: "daily",
      priority: 0.6,
    }));
  } catch (error) {
    console.error("Failed to fetch heroes for sitemap", error);
    return [];
  }
}

async function loadItemEntries(): Promise<SitemapEntry[]> {
  try {
    const response = await api.items_api.getItemsByType({ type: "upgrade" });
    return filterShopableItems(response.data as Upgrade[]).map((item) => ({
      path: `/analytics/items/${itemSlug(item.name)}`,
      changefreq: "daily",
      priority: 0.6,
    }));
  } catch (error) {
    console.error("Failed to fetch items for sitemap", error);
    return [];
  }
}

export async function buildSitemapXml(): Promise<string> {
  const blogEntries: SitemapEntry[] = loadBlogEntries().map((post) => ({
    path: `/blog/${post.slug}`,
    lastmod: post.date,
    changefreq: "monthly",
    priority: 0.7,
  }));
  const blogIndex: SitemapEntry = {
    path: "/blog",
    lastmod: blogEntries
      .map((post) => post.lastmod)
      .sort()
      .at(-1),
    changefreq: "weekly",
    priority: 0.7,
  };
  const [heroEntries, itemEntries] = await Promise.all([loadHeroEntries(), loadItemEntries()]);
  const all = [...STATIC_ENTRIES, ...ANALYTICS_VIEW_ENTRIES, blogIndex, ...blogEntries, ...heroEntries, ...itemEntries];
  const body = all.map(renderUrl).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export function buildSitemapIndexXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <sitemap>\n    <loc>${SITE_URL}/sitemap.xml</loc>\n  </sitemap>\n</sitemapindex>\n`;
}
