import { lazyRouteComponent } from "@tanstack/react-router";
import type { AnalyticsHeroStats } from "deadlock_api_client";

import { analyticsTabFromPath, ANALYTICS_VIEWS, redirectAnalyticsTab } from "~/lib/analytics-tabs";
import type { DateFilterPreference } from "~/lib/date-filter-preference";
import { DEFAULT_MATCH_MODE } from "~/lib/game-mode";
import { prefetchSafe } from "~/lib/prefetch-safe";
import { defaultPeriodLabel, defaultPrevUnixRange, defaultUnixRange, type SeasonInfo } from "~/lib/seasons";
import { pageTitle, seo } from "~/lib/seo";
import type { SlimHero } from "~/queries/asset-queries";
import type { RouterContext } from "~/router";

const DEFAULT_MIN_RANK = 91;
const DEFAULT_MAX_RANK = 116;

function defaultHeroStatsRanges(seasons: readonly SeasonInfo[], preference: DateFilterPreference = "season") {
  const prev = defaultPrevUnixRange(seasons, preference);
  return {
    ...defaultUnixRange(seasons, preference),
    prevMinUnixTimestamp: prev.minUnixTimestamp,
    prevMaxUnixTimestamp: prev.maxUnixTimestamp,
  };
}

/** Highest win rate among heroes with enough matches for the number to mean something. */
function findWinRateLeader(
  stats: readonly AnalyticsHeroStats[] | undefined,
  heroes: readonly SlimHero[] | undefined,
): { name: string; winRate: number } | null {
  if (!stats || !heroes) return null;
  const total = stats.reduce((sum, row) => sum + row.matches, 0);
  const minMatches = Math.max(100, total * 0.005);
  let best: { name: string; winRate: number } | null = null;
  for (const row of stats) {
    if (row.matches < minMatches) continue;
    const winRate = row.wins / row.matches;
    if (best && winRate <= best.winRate) continue;
    const hero = heroes.find((h) => h.id === row.hero_id);
    if (hero?.name) best = { name: hero.name, winRate };
  }
  return best;
}

export const heroesPageOptions = {
  beforeLoad: redirectAnalyticsTab,
  component: lazyRouteComponent(() => import("./HeroesPage"), "HeroesPage"),
  loader: async ({ context: { queryClient, preferences } }: { context: RouterContext }) => {
    // Shared route options are not automatically split by the router plugin.
    // Import query code only when this loader runs, rather than on every page.
    const [{ heroesQueryOptions, loadSeasons }, { heroBanStatsQueryOptions }, { heroStatsQueryOptions }] =
      await Promise.all([
        import("~/queries/asset-queries"),
        import("~/queries/hero-ban-stats-query"),
        import("~/queries/hero-stats-query"),
      ]);
    const seasons = await loadSeasons(queryClient);
    const r = defaultHeroStatsRanges(seasons, preferences.dateFilter);
    const common = {
      minHeroMatches: 0,
      minHeroMatchesTotal: 0,
      minAverageBadge: DEFAULT_MIN_RANK,
      maxAverageBadge: DEFAULT_MAX_RANK,
      gameMode: "normal" as const,
      matchMode: DEFAULT_MATCH_MODE,
    };
    const [stats, heroes] = await Promise.all([
      prefetchSafe(
        queryClient.ensureQueryData(
          heroStatsQueryOptions({
            ...common,
            minUnixTimestamp: r.minUnixTimestamp,
            maxUnixTimestamp: r.maxUnixTimestamp,
          }),
        ),
      ),
      prefetchSafe(queryClient.ensureQueryData(heroesQueryOptions)),
      prefetchSafe(
        queryClient.ensureQueryData(
          heroStatsQueryOptions({
            ...common,
            minUnixTimestamp: r.prevMinUnixTimestamp,
            maxUnixTimestamp: r.prevMaxUnixTimestamp,
          }),
        ),
      ),
      prefetchSafe(
        queryClient.ensureQueryData(
          heroBanStatsQueryOptions({
            matchMode: DEFAULT_MATCH_MODE,
            minAverageBadge: DEFAULT_MIN_RANK,
            maxAverageBadge: DEFAULT_MAX_RANK,
            minUnixTimestamp: r.minUnixTimestamp,
            maxUnixTimestamp: r.maxUnixTimestamp,
          }),
        ),
      ),
      prefetchSafe(
        queryClient.ensureQueryData(
          heroBanStatsQueryOptions({
            matchMode: DEFAULT_MATCH_MODE,
            minAverageBadge: DEFAULT_MIN_RANK,
            maxAverageBadge: DEFAULT_MAX_RANK,
            minUnixTimestamp: r.prevMinUnixTimestamp,
            maxUnixTimestamp: r.prevMaxUnixTimestamp,
          }),
        ),
      ),
    ]);
    // The leader is measured over the default range, which is this season unless the visitor prefers patches.
    return { leader: findWinRateLeader(stats, heroes), period: defaultPeriodLabel(seasons, preferences.dateFilter) };
  },
  head: ({
    loaderData,
    match,
  }: {
    loaderData?: { leader: { name: string; winRate: number } | null; period: string };
    match: { pathname: string };
  }) => {
    const tab = analyticsTabFromPath("heroes", match.pathname);
    const view = ANALYTICS_VIEWS.heroes[tab];
    // The leader is the overall table's headline; the other views are about something else.
    const leader = tab === "stats" ? loaderData?.leader : null;
    const lead = leader ? ` ${leader.name} leads ${loaderData?.period} at ${(leader.winRate * 100).toFixed(1)}%.` : "";
    return seo({
      title: pageTitle(view.title),
      description: view.description + lead,
      path: match.pathname.replace(/\/$/, ""),
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Dataset",
        name: view.title,
        description: view.description,
        url: `https://deadlock-api.com${match.pathname.replace(/\/$/, "")}`,
        keywords: ["Deadlock", "hero win rates", "pick rates", "ban rates", "matchups", "hero meta"],
        creator: { "@type": "Organization", name: "Deadlock API", url: "https://deadlock-api.com" },
        isAccessibleForFree: true,
        license: "https://github.com/deadlock-api/deadlock-api/blob/master/LICENSE",
      },
    });
  },
};
