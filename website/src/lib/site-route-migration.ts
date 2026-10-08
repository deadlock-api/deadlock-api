import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";

import { ANALYTICS_TABS, canonicalAnalyticsHref } from "./analytics-tabs";
import { heroSlug } from "./hero-slug";
import { catchPrefetch, ensureCached } from "./prefetch-safe";

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
  "/deadlockdle": "/games/deadlockdle",
  "/flashcards": "/games/flashcards",
  // A short link to share a comparison: `/compare?players=1,2`.
  "/compare": "/analytics/players/compare",
} as const;

/** Keep shared links intact, including their filters, selected matches, archive dates and fragment. */
export function migrateLegacyHref(href: string): string | null {
  const url = new URL(href, "https://deadlock-api.com");
  const root = `/${url.pathname.split("/")[1]}`;
  if (root === "/games" && /^\/games\/(deadlockdle|flashcards)(\/|$)/.test(url.pathname)) return null;
  if (root === "/players" && url.pathname.replace(/\/$/, "") !== root) {
    return `/tracker${url.pathname}${url.search}${url.hash}`;
  }
  const destination = LEGACY_PAGE_PATHS[root as keyof typeof LEGACY_PAGE_PATHS];
  if (!destination) return null;
  const migrated = destination + url.pathname.slice(root.length) + url.search + url.hash;
  return canonicalAnalyticsHref(migrated) ?? migrated;
}

export function redirectLegacyPage({ location }: { location: { href: string } }) {
  const href = migrateLegacyHref(location.href);
  if (href) throw redirect({ href, statusCode: 301 });
}

/** Paths of the hero views that once took the selected hero as `?heroId=`, before and after the move to /analytics. */
function isLegacyHeroViewPath(pathname: string): boolean {
  const path = pathname.replace(/\/$/, "");
  return (
    path === "/heroes" ||
    Object.values(ANALYTICS_TABS.heroes).some((suffix) => path === `/analytics/heroes/${suffix}`.replace(/\/$/, ""))
  );
}

/**
 * A hero view carrying `?heroId=` was about that one hero, and search engines still hold such links: they go to the
 * hero's own page, so its ranking signals land there instead of on a view whose canonical names no hero.
 */
export function legacyHeroIdHref(href: string, heroes: readonly { id: number; name: string }[]): string | null {
  const url = new URL(href, "https://deadlock-api.com");
  const heroId = url.searchParams.get("heroId");
  if (!heroId || !/^\d+$/.test(heroId) || !isLegacyHeroViewPath(url.pathname)) return null;
  const hero = heroes.find((h) => h.id === Number(heroId));
  return hero ? `/analytics/heroes/${heroSlug(hero.name)}` : null;
}

/** Redirects a legacy `?heroId=` link to its hero's page; the hero list is only loaded when the parameter is there. */
export async function redirectLegacyHeroId({
  location,
  context,
}: {
  location: { href: string };
  context: { queryClient: QueryClient };
}) {
  if (!location.href.includes("heroId=")) return;
  const { filterPlayableHeroes, heroesQueryOptions } = await import("~/queries/asset-queries");
  const heroes = await catchPrefetch(ensureCached(context.queryClient, heroesQueryOptions));
  const href = heroes && legacyHeroIdHref(location.href, filterPlayableHeroes(heroes));
  if (href) throw redirect({ href, statusCode: 301 });
}
