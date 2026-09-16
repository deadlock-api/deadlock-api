import { redirect } from "@tanstack/react-router";

/** Existing tab values remain stable inside the UI; paths are the public navigation contract. */
export const ANALYTICS_TABS = {
  heroes: {
    stats: "",
    "stats-over-time": "over-time",
    "stats-by-duration": "by-duration",
    "stats-by-rank": "by-rank",
    "stats-by-experience": "by-experience",
    "hero-combs": "combos",
    matchups: "matchups",
    "hero-matchup-details": "matchup-details",
    "hero-scoreboard": "scoreboard",
  },
  items: {
    "item-stats": "",
    "item-purchase-analysis": "item-purchase-analysis",
    "build-flow": "build-flow",
    "item-combos": "combos",
  },
  games: { overview: "", "over-time": "over-time", "by-rank": "by-rank", economy: "economy" },
  players: { scoreboard: "", "stats-metrics": "stats-metrics" },
} as const;

export type AnalyticsSection = keyof typeof ANALYTICS_TABS;
export type AnalyticsTab<S extends AnalyticsSection> = keyof (typeof ANALYTICS_TABS)[S] & string;

export function analyticsTabPath<S extends AnalyticsSection>(section: S, tab: AnalyticsTab<S>): string {
  const suffix = ANALYTICS_TABS[section][tab];
  return `/analytics/${section}${suffix ? `/${suffix}` : ""}`;
}

export function analyticsTabFromPath<S extends AnalyticsSection>(section: S, pathname: string): AnalyticsTab<S> {
  const entries = Object.entries(ANALYTICS_TABS[section]);
  const suffix = pathname.replace(/\/$/, "").slice(`/analytics/${section}`.length).replace(/^\//, "");
  return (entries.find(([, path]) => path === suffix) ?? entries[0])[0] as AnalyticsTab<S>;
}

/** Translate old ?tab= links once; an explicit view path takes precedence over a stale query tab. */
export function canonicalAnalyticsHref(href: string): string | null {
  const url = new URL(href, "https://deadlock-api.com");
  const pathname = url.pathname.replace(/\/$/, "");
  const section = pathname.split("/")[2] as AnalyticsSection;
  if (!pathname.startsWith("/analytics/") || !Object.hasOwn(ANALYTICS_TABS, section) || !url.searchParams.has("tab"))
    return null;
  const tabs = ANALYTICS_TABS[section];
  const base = `/analytics/${section}`;
  if (!Object.values(tabs).some((suffix) => pathname === base + (suffix ? `/${suffix}` : ""))) return null;
  const tab = url.searchParams.get("tab")!;
  if (pathname === base && Object.hasOwn(tabs, tab)) {
    url.pathname = analyticsTabPath(section, tab as AnalyticsTab<typeof section>);
  }
  url.searchParams.delete("tab");
  return url.pathname + url.search + url.hash;
}

export function redirectAnalyticsTab({ location }: { location: { href: string } }) {
  const href = canonicalAnalyticsHref(location.href);
  if (href) throw redirect({ href, statusCode: 301 });
}

export function analyticsPageTitle(pathname: string, title: string): string {
  const view = pathname.replace(/\/$/, "").split("/")[3];
  return view ? `${view.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())} · ${title}` : title;
}
