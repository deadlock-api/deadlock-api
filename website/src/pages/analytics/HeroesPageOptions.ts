import type { QueryExecuteOptions, QueryKey } from "@tanstack/react-query";
import { lazyRouteComponent } from "@tanstack/react-router";
import type { AnalyticsHeroStats, HeroBanStats } from "deadlock_api_client";

import { type AnalyticsTab, analyticsTabFromPath, ANALYTICS_VIEWS, redirectAnalyticsTab } from "~/lib/analytics-tabs";
import { computeBanRates } from "~/lib/ban-rate";
import { getPickrateMultiplier } from "~/lib/constants";
import type { DateFilterPreference } from "~/lib/date-filter-preference";
import { DEFAULT_MATCH_MODE } from "~/lib/game-mode";
import { heroSlug } from "~/lib/hero-slug";
import { rankHeroes, type Tier } from "~/lib/hero-tiers";
import { prefetchSafe } from "~/lib/prefetch-safe";
import {
  defaultPeriodLabel,
  defaultPrevUnixRange,
  defaultTemporalCoverage,
  defaultUnixRange,
  type SeasonInfo,
} from "~/lib/seasons";
import { datasetJsonLd, pageTitle, seo, SITE_URL } from "~/lib/seo";
import { redirectLegacyHeroId } from "~/lib/site-route-migration";
import type { SlimHero } from "~/queries/asset-queries";
import type { RouterContext } from "~/router";

const DEFAULT_MIN_RANK = 91;
const DEFAULT_MAX_RANK = 116;
const DEFAULT_MIN_MATCHES = 10;

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

/** Every hero the tier list shows with no filters set, best first, with its tier letter. */
function findTierList(
  stats: readonly AnalyticsHeroStats[] | undefined,
  bans: readonly HeroBanStats[] | undefined,
  heroes: readonly SlimHero[] | undefined,
): TieredHero[] {
  if (!stats || !heroes) return [];
  const names = new Map(heroes.map((hero) => [hero.id, hero.name]));
  return rankHeroes(
    stats.map((row) => ({ heroId: row.hero_id, wins: row.wins, matches: row.matches })),
    getPickrateMultiplier("normal"),
    bans ? computeBanRates([...bans]) : undefined,
  )
    .filter((hero) => names.has(hero.heroId))
    .map((hero) => ({ name: names.get(hero.heroId)!, tier: hero.tier }));
}

interface TieredHero {
  name: string;
  tier: Tier;
}

/** The tier list as schema.org's ItemList, in the order and with the tiers the page shows. */
function tierListJsonLd(name: string, heroes: readonly TieredHero[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    numberOfItems: heroes.length,
    itemListElement: heroes.map((hero, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: `${hero.name} (${hero.tier.toUpperCase()} tier)`,
      url: `${SITE_URL}/analytics/heroes/${heroSlug(hero.name)}`,
    })),
  };
}

type HeroStatsRanges = ReturnType<typeof defaultHeroStatsRanges>;

/**
 * Prefetches what a view other than the overall table renders with no search params: the defaults of `useHeroFilters`
 * and of the view itself, in the exact query keys its components ask for.
 */
async function prefetchHeroView(
  queryClient: RouterContext["queryClient"],
  tab: Exclude<AnalyticsTab<"heroes">, "stats" | "tier-list">,
  r: HeroStatsRanges,
) {
  const range = { minUnixTimestamp: r.minUnixTimestamp, maxUnixTimestamp: r.maxUnixTimestamp };
  const prevRange = { minUnixTimestamp: r.prevMinUnixTimestamp, maxUnixTimestamp: r.prevMaxUnixTimestamp };
  const ranks = { minAverageBadge: DEFAULT_MIN_RANK, maxAverageBadge: DEFAULT_MAX_RANK };
  const mode = { gameMode: "normal" as const, matchMode: DEFAULT_MATCH_MODE };
  const prefetch = <TQueryFnData, TError, TData, TQueryKey extends QueryKey>(
    options: QueryExecuteOptions<TQueryFnData, TError, TData, TQueryFnData, TQueryKey>,
  ) => prefetchSafe(queryClient.query({ ...options, staleTime: "static" }));

  switch (tab) {
    case "stats-over-time":
    case "stats-by-duration":
    case "stats-by-rank":
    case "stats-by-experience": {
      const [
        { heroChartStatsQueryOptions, heroRankStatsQueryOptions },
        { DURATION_BUCKETS, EXPERIENCE_BUCKETS },
        { ranksQueryOptions },
      ] = await Promise.all([
        import("~/queries/hero-stats-query"),
        import("~/lib/constants"),
        import("~/queries/ranks-query"),
      ]);
      const base = { minHeroMatches: 0, minHeroMatchesTotal: 0, ...ranks, ...range, ...mode };
      if (tab === "stats-over-time") {
        return prefetch(heroChartStatsQueryOptions("over-time", { ...base, bucket: "start_time_day" }));
      }
      if (tab === "stats-by-duration") {
        return Promise.all(
          DURATION_BUCKETS.map((bucket) =>
            prefetch(
              heroChartStatsQueryOptions("by-duration", {
                ...base,
                minDurationS: bucket.minS,
                maxDurationS: bucket.maxS,
                bucket: "no_bucket",
              }),
            ),
          ),
        );
      }
      if (tab === "stats-by-rank") {
        // Every rank, so no rank filter.
        return Promise.all([
          prefetch(
            heroRankStatsQueryOptions({
              minHeroMatches: 0,
              minHeroMatchesTotal: 0,
              ...range,
              ...mode,
              bucket: "avg_badge",
            }),
          ),
          prefetch(ranksQueryOptions),
        ]);
      }
      return Promise.all(
        EXPERIENCE_BUCKETS.map((bucket) =>
          prefetch(
            heroChartStatsQueryOptions("by-experience", {
              ...base,
              minHeroMatchesTotal: bucket.min,
              maxHeroMatchesTotal: bucket.max,
              bucket: "no_bucket",
            }),
          ),
        ),
      );
    }
    case "hero-combs": {
      const { heroCombStatsQueryOptions } = await import("~/queries/hero-comb-stats-query");
      const comb = { combSize: 2, minMatches: DEFAULT_MIN_MATCHES, ...ranks, ...mode };
      return Promise.all([
        prefetch(heroCombStatsQueryOptions({ ...comb, ...range })),
        prefetch(heroCombStatsQueryOptions({ ...comb, ...prevRange })),
      ]);
    }
    case "matchups":
    case "hero-matchup-details": {
      const [{ heroStatsQueryOptions }, { heroCounterWinsQueryOptions, heroSynergyWinsQueryOptions }] =
        await Promise.all([import("~/queries/hero-stats-query"), import("~/queries/hero-matchup-query")]);
      const pairs = { sameLaneFilter: true, minMatches: DEFAULT_MIN_MATCHES, ...ranks, ...mode };
      const stats = { minHeroMatches: DEFAULT_MIN_MATCHES, ...ranks, ...mode };
      return Promise.all([
        // The explorer states the total floor in its current-period key; the matchup table does not.
        prefetch(
          heroStatsQueryOptions(
            tab === "matchups" ? { ...stats, ...range } : { ...stats, minHeroMatchesTotal: 0, ...range },
          ),
        ),
        prefetch(heroStatsQueryOptions({ ...stats, ...prevRange })),
        prefetch(heroSynergyWinsQueryOptions({ ...pairs, ...range })),
        prefetch(heroSynergyWinsQueryOptions({ ...pairs, ...prevRange })),
        prefetch(heroCounterWinsQueryOptions({ ...pairs, ...range })),
        prefetch(heroCounterWinsQueryOptions({ ...pairs, ...prevRange })),
      ]);
    }
    case "hero-scoreboard": {
      const { heroScoreboardQueryOptions } = await import("~/queries/hero-scoreboard-query");
      return prefetch(
        heroScoreboardQueryOptions({
          sortBy: "winrate",
          sortDirection: "desc",
          minMatches: DEFAULT_MIN_MATCHES,
          ...ranks,
          ...mode,
          ...range,
        }),
      );
    }
  }
}

export const heroesPageOptions = {
  beforeLoad: async (options: { location: { href: string }; context: RouterContext }) => {
    await redirectLegacyHeroId(options);
    redirectAnalyticsTab(options);
  },
  component: lazyRouteComponent(() => import("./HeroesPage"), "HeroesPage"),
  loader: async ({
    context: { queryClient, preferences },
    location,
  }: {
    context: RouterContext;
    location: { pathname: string };
  }) => {
    const tab = analyticsTabFromPath("heroes", location.pathname);
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
    const period = defaultPeriodLabel(seasons, preferences.dateFilter);
    const coverage = defaultTemporalCoverage(seasons, preferences.dateFilter);
    const heroes = prefetchSafe(queryClient.query({ ...heroesQueryOptions, staleTime: "static" }));
    // The server waits for the view's data, so its HTML carries it. In the browser a tab click does not: the view shows
    // its own loading state, where waiting kept the navigation pending and washed out the whole page (PendingNavigation).
    const isServer = typeof window === "undefined";
    if (tab !== "stats" && tab !== "tier-list") {
      const view = Promise.all([heroes, prefetchHeroView(queryClient, tab, r)]);
      if (isServer) await view;
      return { leader: null, tierList: [], period, coverage };
    }
    const common = {
      minHeroMatches: 0,
      minHeroMatchesTotal: 0,
      minAverageBadge: DEFAULT_MIN_RANK,
      maxAverageBadge: DEFAULT_MAX_RANK,
      gameMode: "normal" as const,
      matchMode: DEFAULT_MATCH_MODE,
    };
    const statsFor = (minUnixTimestamp: number | undefined, maxUnixTimestamp: number | undefined) =>
      prefetchSafe(
        queryClient.query({
          ...heroStatsQueryOptions({ ...common, minUnixTimestamp, maxUnixTimestamp }),
          staleTime: "static",
        }),
      );
    const bansFor = (minUnixTimestamp: number | undefined, maxUnixTimestamp: number | undefined) =>
      prefetchSafe(
        queryClient.query({
          ...heroBanStatsQueryOptions({
            matchMode: DEFAULT_MATCH_MODE,
            minAverageBadge: DEFAULT_MIN_RANK,
            maxAverageBadge: DEFAULT_MAX_RANK,
            minUnixTimestamp,
            maxUnixTimestamp,
          }),
          staleTime: "static",
        }),
      );
    const current = Promise.all([
      statsFor(r.minUnixTimestamp, r.maxUnixTimestamp),
      heroes,
      bansFor(r.minUnixTimestamp, r.maxUnixTimestamp),
    ]);
    // Only the overall table compares with the previous period; the tier list would carry it in its HTML for nothing.
    const previous =
      tab === "stats"
        ? Promise.all([
            statsFor(r.prevMinUnixTimestamp, r.prevMaxUnixTimestamp),
            bansFor(r.prevMinUnixTimestamp, r.prevMaxUnixTimestamp),
          ])
        : undefined;
    if (!isServer) return { leader: null, tierList: [], period, coverage };
    const [[stats, heroList, bans]] = await Promise.all([current, previous]);
    if (tab === "tier-list") return { leader: null, tierList: findTierList(stats, bans, heroList), period, coverage };
    // The leader is measured over the default range, which is this season unless the visitor prefers patches.
    return { leader: findWinRateLeader(stats, heroList), tierList: [], period, coverage };
  },
  head: ({
    loaderData,
    match,
  }: {
    loaderData?: {
      leader: { name: string; winRate: number } | null;
      tierList: TieredHero[];
      period: string;
      coverage?: string;
    };
    match: { pathname: string };
  }) => {
    const tab = analyticsTabFromPath("heroes", match.pathname);
    const view = ANALYTICS_VIEWS.heroes[tab];
    // The leader is the overall table's headline; the other views are about something else.
    const leader = tab === "stats" ? loaderData?.leader : null;
    const tierList = tab === "tier-list" ? (loaderData?.tierList ?? []) : [];
    const sTier = tierList.filter((hero) => hero.tier === "s").map((hero) => hero.name);
    const lead = leader
      ? ` ${leader.name} leads ${loaderData?.period} at ${(leader.winRate * 100).toFixed(1)}%.`
      : sTier.length > 0
        ? ` S tier: ${sTier.slice(0, 4).join(", ")}${sTier.length > 4 ? " and more" : ""}.`
        : "";
    const dataset = datasetJsonLd({
      name: view.title,
      description: view.description,
      path: match.pathname.replace(/\/$/, ""),
      keywords: [
        "Deadlock",
        ...(tab === "tier-list" ? ["tier list", "hero tier list"] : []),
        "hero win rates",
        "pick rates",
        "ban rates",
        "matchups",
        "hero meta",
      ],
      variableMeasured: ["win rate", "pick rate", "ban rate", "matches played"],
      apiPath: "/v1/analytics/hero-stats",
      // The loader's default range feeds the overall table and the tier list; the other views pick their own windows.
      temporalCoverage: tab === "stats" || tab === "tier-list" ? loaderData?.coverage : undefined,
    });
    return seo({
      title: pageTitle(view.title),
      description: view.description + lead,
      path: match.pathname.replace(/\/$/, ""),
      jsonLd: tierList.length > 0 ? [dataset, tierListJsonLd(view.heading, tierList)] : dataset,
    });
  },
};
