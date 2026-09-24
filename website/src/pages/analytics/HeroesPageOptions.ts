import { lazyRouteComponent } from "@tanstack/react-router";
import type { AnalyticsHeroStats } from "deadlock_api_client";

import { analyticsTabFromPath, ANALYTICS_VIEWS, redirectAnalyticsTab } from "~/lib/analytics-tabs";
import type { DateFilterPreference } from "~/lib/date-filter-preference";
import { DEFAULT_MATCH_MODE } from "~/lib/game-mode";
import { heroSlug } from "~/lib/hero-slug";
import { computeHeroTiers, type Tier } from "~/lib/hero-tiers";
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

interface TierListHero {
  name: string;
  slug: string;
  tier: Tier;
}

/** The tier list of the default filters, best first, for the page's ItemList and description. */
function tierListHeroes(
  stats: readonly AnalyticsHeroStats[] | undefined,
  heroes: readonly SlimHero[] | undefined,
): TierListHero[] | null {
  if (!stats || !heroes) return null;
  const names = new Map(heroes.flatMap((hero) => (hero.name ? [[hero.id, hero.name] as const] : [])));
  const { entries } = computeHeroTiers(
    stats
      .filter((row) => names.has(row.hero_id))
      .map((row) => ({ heroId: row.hero_id, wins: row.wins, matches: row.matches })),
  );
  return entries.map(({ heroId, tier }) => {
    const name = names.get(heroId)!;
    return { name, slug: heroSlug(name), tier };
  });
}

const DESCRIPTION_MAX_LENGTH = 155;

/** "S tier: Haze, Seven and Paradox." with as many names as fit after the description, "…, Seven and more." if not all. */
function sTierSentence(description: string, tiers: readonly TierListHero[]): string {
  const names = tiers.filter((hero) => hero.tier === "S").map((hero) => hero.name);
  for (let count = names.length; count > 0; count--) {
    const shown = names.slice(0, count);
    const list =
      count < names.length
        ? `${shown.join(", ")} and more`
        : shown.length > 1
          ? `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}`
          : shown[0];
    const sentence = ` S tier: ${list}.`;
    if (description.length + sentence.length <= DESCRIPTION_MAX_LENGTH) return sentence;
  }
  return "";
}

export const heroesPageOptions = {
  beforeLoad: redirectAnalyticsTab,
  component: lazyRouteComponent(() => import("./HeroesPage"), "HeroesPage"),
  loader: async ({
    context: { queryClient, preferences },
    location,
  }: {
    context: RouterContext;
    location: { pathname: string };
  }) => {
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
    const onTierList = analyticsTabFromPath("heroes", location.pathname) === "tier-list";
    return {
      leader: findWinRateLeader(stats, heroes),
      period: defaultPeriodLabel(seasons, preferences.dateFilter),
      // Only the tier list page carries its heroes in the loader data, for the ItemList below.
      tiers: onTierList ? tierListHeroes(stats, heroes) : null,
    };
  },
  head: ({
    loaderData,
    match,
  }: {
    loaderData?: {
      leader: { name: string; winRate: number } | null;
      period: string;
      tiers: TierListHero[] | null;
    };
    match: { pathname: string };
  }) => {
    const tab = analyticsTabFromPath("heroes", match.pathname);
    const view = ANALYTICS_VIEWS.heroes[tab];
    // The leader is the overall table's headline; the other views are about something else.
    const leader = tab === "stats" ? loaderData?.leader : null;
    const lead = leader ? ` ${leader.name} leads ${loaderData?.period} at ${(leader.winRate * 100).toFixed(1)}%.` : "";
    const tiers = tab === "tier-list" ? loaderData?.tiers : null;
    const path = match.pathname.replace(/\/$/, "");
    const dataset = {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: view.title,
      description: view.description,
      url: `https://deadlock-api.com${path}`,
      keywords: ["Deadlock", "tier list", "hero win rates", "pick rates", "ban rates", "matchups", "hero meta"],
      creator: { "@type": "Organization", name: "Deadlock API", url: "https://deadlock-api.com" },
      isAccessibleForFree: true,
      license: "https://github.com/deadlock-api/deadlock-api/blob/master/LICENSE",
    };
    return seo({
      title: pageTitle(view.title),
      description: view.description + (tiers ? sTierSentence(view.description, tiers) : lead),
      path,
      jsonLd: tiers?.length
        ? [
            dataset,
            {
              "@context": "https://schema.org",
              "@type": "ItemList",
              name: `${view.heading}, ${loaderData?.period}`,
              itemListOrder: "https://schema.org/ItemListOrderDescending",
              numberOfItems: tiers.length,
              itemListElement: tiers.map((hero, index) => ({
                "@type": "ListItem",
                position: index + 1,
                name: `${hero.name} (${hero.tier} tier)`,
                url: `https://deadlock-api.com/analytics/heroes/${hero.slug}`,
              })),
            },
          ]
        : dataset,
    });
  },
};
