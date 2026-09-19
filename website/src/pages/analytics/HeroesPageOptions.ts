import { lazyRouteComponent } from "@tanstack/react-router";
import type { AnalyticsHeroStats } from "deadlock_api_client";

import { DEFAULT_MATCH_MODE } from "~/components/selectors/MatchModeSelector";
import { analyticsPageTitle, redirectAnalyticsTab } from "~/lib/analytics-tabs";
import { prefetchSafe } from "~/lib/prefetch-safe";
import { defaultPrevUnixRange, defaultUnixRange, type SeasonInfo } from "~/lib/seasons";
import { seo } from "~/lib/seo";
import { heroesQueryOptions, loadSeasons, type SlimHero } from "~/queries/asset-queries";
import { heroBanStatsQueryOptions } from "~/queries/hero-ban-stats-query";
import { heroStatsQueryOptions } from "~/queries/hero-stats-query";
import type { RouterContext } from "~/router";

const DEFAULT_MIN_RANK = 91;
const DEFAULT_MAX_RANK = 116;

function defaultHeroStatsRanges(seasons: readonly SeasonInfo[]) {
  const prev = defaultPrevUnixRange(seasons);
  return {
    ...defaultUnixRange(seasons),
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
  loader: async ({ context: { queryClient } }: { context: RouterContext }) => {
    const r = defaultHeroStatsRanges(await loadSeasons(queryClient));
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
    return { leader: findWinRateLeader(stats, heroes) };
  },
  head: ({
    loaderData,
    match,
  }: {
    loaderData?: { leader: { name: string; winRate: number } | null };
    match: { pathname: string };
  }) => {
    const leader = loaderData?.leader;
    const lead = leader ? ` ${leader.name} leads the current patch at ${(leader.winRate * 100).toFixed(1)}%.` : "";
    return seo({
      title: analyticsPageTitle(match.pathname, "Deadlock Hero Win Rates & Pick Rates: Live Match Data"),
      description: `Deadlock hero win rates, pick rates, matchups, and synergies for every hero.${lead} Filter by rank and patch. Updated daily from live match data.`,
      path: match.pathname.replace(/\/$/, ""),
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Dataset",
        name: "Deadlock Hero Win Rates & Pick Rates",
        description:
          "Win rates, pick rates, ban rates, and matchup data for every Deadlock hero, calculated from tracked ranked matches and updated daily. Filterable by rank, patch, and game mode.",
        url: `https://deadlock-api.com${match.pathname.replace(/\/$/, "")}`,
        keywords: ["Deadlock", "hero win rates", "pick rates", "ban rates", "matchups", "hero meta"],
        creator: { "@type": "Organization", name: "Deadlock API", url: "https://deadlock-api.com" },
        isAccessibleForFree: true,
        license: "https://github.com/deadlock-api/deadlock-api/blob/master/LICENSE",
      },
    });
  },
};
