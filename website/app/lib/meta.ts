const SITE_URL = "https://deadlock-api.com";

interface PageMetaOptions {
  title: string;
  description: string;
  path: string;
  ogImage?: string;
  ogType?: string;
  publishedTime?: string;
}

export function createPageMeta({ title, description, path, ogImage, ogType, publishedTime }: PageMetaOptions) {
  const url = `${SITE_URL}${path}`;
  const image = ogImage ?? `${SITE_URL}${OG_IMAGES[path] ?? "/og/default.png"}`;
  const meta: Record<string, string>[] = [
    { title },
    { name: "description", content: description },
    { tagName: "link", rel: "canonical", href: url },
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
  return meta;
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
  "/ingest-cache": "/og/ingest-cache.png",
  "/blog": "/og/blog.png",
};

/** OG image for a blog post by slug */
export function getBlogOGImage(slug: string): string {
  return `/og/blog-${slug}.png`;
}
