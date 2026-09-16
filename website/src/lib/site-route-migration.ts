import { redirect } from "@tanstack/react-router";

import { canonicalAnalyticsHref } from "./analytics-tabs";

export const LEGACY_PAGE_PATHS = {
  "/games": "/analytics/games",
  "/heroes": "/analytics/heroes",
  "/items": "/analytics/items",
  "/abilities": "/analytics/abilities",
  "/players": "/analytics/players",
  "/team-builder": "/analytics/team-builder",
  "/leaderboard": "/community/leaderboard",
  "/badge-distribution": "/community/badge-distribution",
  "/heatmap": "/community/heatmap",
} as const;

/** Keep shared links intact, including their filters and fragment. Tracker profiles stay put. */
export function migrateLegacyHref(href: string): string | null {
  const url = new URL(href, "https://deadlock-api.com");
  const root = `/${url.pathname.split("/")[1]}`;
  const destination = LEGACY_PAGE_PATHS[root as keyof typeof LEGACY_PAGE_PATHS];
  if (!destination || (root === "/players" && url.pathname.replace(/\/$/, "") !== root)) return null;
  const migrated = destination + url.pathname.slice(root.length) + url.search + url.hash;
  return canonicalAnalyticsHref(migrated) ?? migrated;
}

export function redirectLegacyPage({ location }: { location: { href: string } }) {
  const href = migrateLegacyHref(location.href);
  if (href) throw redirect({ href, statusCode: 301 });
}
