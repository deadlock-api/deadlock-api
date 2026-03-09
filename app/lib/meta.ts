const SITE_URL = "https://deadlock-api.com";

interface PageMetaOptions {
  title: string;
  description: string;
  path: string;
  ogImage?: string;
}

export function createPageMeta({ title, description, path, ogImage }: PageMetaOptions) {
  const url = `${SITE_URL}${path}`;
  const image = ogImage ?? `${SITE_URL}${OG_IMAGES[path] ?? "/og/default.png"}`;
  return [
    { title },
    { name: "description", content: description },
    { tagName: "link", rel: "canonical", href: url },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: url },
    { property: "og:image", content: image },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
  ];
}

/** Per-route OG images (1200x630). Falls back to /og/default.png */
const OG_IMAGES: Record<string, string> = {
  "/": "/og/default.png",
  "/heroes": "/og/heroes.png",
  "/items": "/og/items.png",
  "/abilities": "/og/abilities.png",
  "/leaderboard": "/og/leaderboard.png",
  "/badge-distribution": "/og/leaderboard.png",
  "/games": "/og/default.png",
  "/heatmap": "/og/default.png",
  "/player-scoreboard": "/og/leaderboard.png",
  "/streamkit": "/og/default.png",
  "/chat": "/og/default.png",
  "/deadlockdle": "/og/default.png",
};
