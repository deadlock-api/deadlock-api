const SITE_URL = "https://deadlock-api.com";

/**
 * The site's publisher, as every JSON-LD block names it. The `@id` ties them all to the one Organization node the
 * homepage describes in full, so search engines read one entity instead of a new one per page.
 */
const ORGANIZATION = {
  "@type": "Organization",
  "@id": `${SITE_URL}/#organization`,
  name: "Deadlock API",
  url: SITE_URL,
  logo: { "@type": "ImageObject", url: `${SITE_URL}/favicon.png` },
};

const TITLE_SUFFIX = " | Deadlock API";
/** Search results cut titles at about 60 characters; past that the suffix would only push the page's name out. */
const TITLE_MAX_LENGTH = 60;

/** A page's document title: its name, then the one site suffix every page uses, when both fit in a search result. */
export function pageTitle(name: string): string {
  return name.length + TITLE_SUFFIX.length <= TITLE_MAX_LENGTH ? name + TITLE_SUFFIX : name;
}

type JsonLd = Record<string, unknown> | Array<Record<string, unknown>>;

interface SeoOptions {
  title: string;
  description: string;
  path: string;
  /**
   * The og:url, when the page shows more than its canonical `path` does (a filled comparison): link previews and
   * re-scrapes then keep what was shared, while search engines still index the one canonical page.
   */
  shareUrl?: string;
  ogImage?: string;
  /**
   * `card` is a 1200x630 share image (the /og/ set). `thumbnail` is game art of another size, such as a hero card:
   * previews show it as a small image beside the text instead of stretching it across the card.
   */
  ogImageKind?: "card" | "thumbnail";
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

/** Per-route OG images (1200x630). Falls back to /og/v2/default.png */
const OG_IMAGES: Record<string, string> = {
  "/": "/og/v2/default.png",
  "/analytics/heroes": "/og/v2/heroes.png",
  "/analytics/items": "/og/v2/items.png",
  "/analytics/abilities": "/og/v2/abilities.png",
  "/community/leaderboard": "/og/v2/leaderboard.png",
  "/community/badge-distribution": "/og/v2/badge-distribution.png",
  "/analytics/games": "/og/v2/games.png",
  "/community/heatmap": "/og/v2/heatmap.png",
  "/analytics/players": "/og/v2/player-scoreboard.png",
  "/streamkit": "/og/v2/streamkit.png",
  "/data-privacy": "/og/v2/default.png",
  "/data-dumps": "/og/v2/default.png",
  "/ingest-cache": "/og/v2/ingest-cache.png",
  "/blog": "/og/v2/blog.png",
  "/games/deadlockdle": "/og/v2/default.png",
};

export function seo({
  title,
  description,
  path,
  shareUrl,
  ogImage,
  ogImageKind = "card",
  ogType,
  publishedTime,
  jsonLd,
}: SeoOptions): SeoResult {
  const url = `${SITE_URL}${path}`;
  const sectionImage = Object.entries(OG_IMAGES).find(([route]) => path.startsWith(`${route}/`))?.[1];
  const image = ogImage ?? `${SITE_URL}${OG_IMAGES[path] ?? sectionImage ?? "/og/v2/default.png"}`;

  const meta: MetaEntry[] = [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: shareUrl ?? url },
    { property: "og:type", content: ogType ?? "website" },
    { property: "og:image", content: image },
    ...(ogImageKind === "card"
      ? [
          { property: "og:image:width", content: "1200" },
          { property: "og:image:height", content: "630" },
        ]
      : []),
    { name: "twitter:card", content: ogImageKind === "card" ? "summary_large_image" : "summary" },
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
      children: serializeJsonLd(jsonLd),
    });
  }

  return { meta, links, scripts };
}

/**
 * JSON for an inline `<script type="application/ld+json">`. `JSON.stringify` leaves `<` alone, so a value such as a
 * Steam name of `</script><script>…` would close the tag and run as HTML; `\u003c` is the same string to a JSON parser.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

interface DatasetOptions {
  name: string;
  description: string;
  path: string;
  keywords: string[];
  /** What the numbers are, such as "win rate" or "pick rate". */
  variableMeasured: string[];
}

interface DataDownload {
  contentUrl: string;
  encodingFormat: string;
}

type DatasetSource =
  /** The public API endpoint that serves the same data, such as `/v1/analytics/hero-stats`. */
  | { apiPath: string; downloads?: never }
  /** Files to download when the data is not an API endpoint, such as the data lake. */
  | { apiPath?: never; downloads: DataDownload[] };

/** Dataset JSON-LD for a stats page: the fields Google's Dataset docs ask for, with the API as its download. */
export function datasetJsonLd({
  name,
  description,
  path,
  keywords,
  variableMeasured,
  apiPath,
  downloads,
}: DatasetOptions & DatasetSource): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name,
    description,
    url: `${SITE_URL}${path}`,
    keywords,
    variableMeasured,
    // The stats are recomputed from new matches all the time, so the day the page is served is the day of its data.
    dateModified: new Date().toISOString().slice(0, 10),
    creator: ORGANIZATION,
    isAccessibleForFree: true,
    license: "https://github.com/deadlock-api/deadlock-api/blob/master/LICENSE",
    distribution: (
      downloads ?? [{ contentUrl: `https://api.deadlock-api.com${apiPath}`, encodingFormat: "application/json" }]
    ).map(({ contentUrl, encodingFormat }) => ({ "@type": "DataDownload", contentUrl, encodingFormat })),
  };
}

/** OG image for a blog post by slug */
export function getBlogOGImage(slug: string): string {
  return `/og/v2/blog-${slug}.png`;
}

export { ORGANIZATION, SITE_URL };
