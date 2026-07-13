import { SITE_URL } from "./seo";

export interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number;
}

const STATIC_ENTRIES: SitemapEntry[] = [
  { path: "/", lastmod: "2026-05-06", changefreq: "weekly", priority: 1.0 },
  { path: "/heroes", changefreq: "daily", priority: 0.9 },
  { path: "/items", changefreq: "daily", priority: 0.9 },
  { path: "/abilities", changefreq: "daily", priority: 0.8 },
  { path: "/leaderboard", changefreq: "daily", priority: 0.8 },
  { path: "/badge-distribution", changefreq: "weekly", priority: 0.7 },
  { path: "/games", changefreq: "daily", priority: 0.7 },
  { path: "/heatmap", changefreq: "weekly", priority: 0.7 },
  { path: "/players", changefreq: "daily", priority: 0.7 },
  { path: "/streamkit", lastmod: "2026-03-12", changefreq: "monthly", priority: 0.6 },
  { path: "/chat", lastmod: "2026-03-12", changefreq: "monthly", priority: 0.5 },
  { path: "/data-privacy", lastmod: "2026-03-22", changefreq: "monthly", priority: 0.5 },
  { path: "/ingest-cache", lastmod: "2026-03-10", changefreq: "monthly", priority: 0.6 },
  { path: "/blog", lastmod: "2026-04-18", changefreq: "weekly", priority: 0.7 },
  { path: "/deadlockdle", changefreq: "daily", priority: 0.8 },
  { path: "/deadlockdle/guess-hero", changefreq: "weekly", priority: 0.6 },
  { path: "/deadlockdle/guess-item", changefreq: "weekly", priority: 0.6 },
  { path: "/deadlockdle/guess-sound", changefreq: "weekly", priority: 0.6 },
  { path: "/deadlockdle/guess-ability", changefreq: "weekly", priority: 0.6 },
  { path: "/deadlockdle/item-stats", changefreq: "weekly", priority: 0.6 },
  { path: "/deadlockdle/trivia", changefreq: "weekly", priority: 0.6 },
  { path: "/servers", changefreq: "daily", priority: 0.8 },
  { path: "/flashcards", changefreq: "weekly", priority: 0.6 },
  { path: "/flashcards/heroes", changefreq: "weekly", priority: 0.6 },
  { path: "/flashcards/items", changefreq: "weekly", priority: 0.6 },
  { path: "/flashcards/item-upgrades", changefreq: "weekly", priority: 0.6 },
  { path: "/data-dumps", changefreq: "weekly", priority: 0.6 },
];

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

export function buildSitemapXml(): string {
  const blogEntries: SitemapEntry[] = loadBlogEntries().map((post) => ({
    path: `/blog/${post.slug}`,
    lastmod: post.date,
    changefreq: "monthly",
    priority: 0.7,
  }));
  const all = [...STATIC_ENTRIES, ...blogEntries];
  const body = all.map(renderUrl).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export function buildSitemapIndexXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <sitemap>\n    <loc>${SITE_URL}/sitemap.xml</loc>\n  </sitemap>\n</sitemapindex>\n`;
}
