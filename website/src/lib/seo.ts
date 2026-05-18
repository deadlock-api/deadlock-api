const SITE_URL = "https://deadlock-api.com";

type JsonLd = Record<string, unknown> | Array<Record<string, unknown>>;

interface SeoOptions {
  title: string;
  description: string;
  path: string;
  ogImage?: string;
  ogType?: string;
  publishedTime?: string;
  jsonLd?: JsonLd;
}

type MetaEntry = { title: string } | { name: string; content: string } | { property: string; content: string };
type LinkEntry = { rel: string; href: string } & Record<string, string>;
type ScriptEntry = { type: string; children: string };

export interface SeoResult {
  meta: MetaEntry[];
  links: LinkEntry[];
  scripts: ScriptEntry[];
}

/** Per-route OG images (1200x630). Falls back to /og/default.png */
const OG_IMAGES: Record<string, string> = {
  "/": "/og/default.png",
  "/heroes": "/og/heroes.png",
  "/items": "/og/items.png",
  "/abilities": "/og/abilities.png",
  "/leaderboard": "/og/leaderboard.png",
  "/badge-distribution": "/og/badge-distribution.png",
  "/games": "/og/games.png",
  "/heatmap": "/og/heatmap.png",
  "/player-scoreboard": "/og/player-scoreboard.png",
  "/streamkit": "/og/streamkit.png",
  "/chat": "/og/chat.png",
  "/data-privacy": "/og/default.png",
  "/data-dumps": "/og/default.png",
  "/ingest-cache": "/og/ingest-cache.png",
  "/blog": "/og/blog.png",
  "/deadlockdle": "/og/default.png",
};

export function seo({ title, description, path, ogImage, ogType, publishedTime, jsonLd }: SeoOptions): SeoResult {
  const url = `${SITE_URL}${path}`;
  const image = ogImage ?? `${SITE_URL}${OG_IMAGES[path] ?? "/og/default.png"}`;

  const meta: MetaEntry[] = [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: url },
    { property: "og:type", content: ogType ?? "website" },
    { property: "og:image", content: image },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
  ];
  if (publishedTime) {
    meta.push({ property: "article:published_time", content: publishedTime });
  }

  const links: LinkEntry[] = [{ rel: "canonical", href: url }];

  const scripts: ScriptEntry[] = [];
  if (jsonLd) {
    scripts.push({
      type: "application/ld+json",
      children: JSON.stringify(jsonLd),
    });
  }

  return { meta, links, scripts };
}

/** OG image for a blog post by slug */
export function getBlogOGImage(slug: string): string {
  return `/og/blog-${slug}.png`;
}

export { SITE_URL };
