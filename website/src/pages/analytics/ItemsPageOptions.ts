import { lazyRouteComponent } from "@tanstack/react-router";

import { ITEM_COMBS_TO_SHOW } from "~/components/features/items/useItemCombFilters";
import { analyticsTabFromPath, ANALYTICS_VIEWS, redirectAnalyticsTab } from "~/lib/analytics-tabs";
import { DEFAULT_MATCH_MODE } from "~/lib/game-mode";
import { prefetchSafe, prefetchSeed } from "~/lib/prefetch-safe";
import { defaultPrevUnixRange, defaultTemporalCoverage, defaultUnixRange } from "~/lib/seasons";
import { datasetJsonLd, pageTitle, seo } from "~/lib/seo";
import { wilsonScoreInterval } from "~/lib/wilson";
import type { RouterContext } from "~/router";

/** The item whose win rate is most confidently high: the largest Wilson lower bound, as the table ranks confidence. */
function findWinRateLeader(
  stats: readonly { item_id: number; wins: number; matches: number }[] | undefined,
  items: readonly { id: number; name?: string | null }[] | undefined,
): { name: string; winRate: number } | null {
  if (!stats || !items) return null;
  const byItem = new Map<number, { wins: number; matches: number }>();
  for (const row of stats) {
    const acc = byItem.get(row.item_id) ?? { wins: 0, matches: 0 };
    acc.wins += row.wins;
    acc.matches += row.matches;
    byItem.set(row.item_id, acc);
  }
  let best: { name: string; winRate: number; lowerBound: number } | null = null;
  for (const [itemId, acc] of byItem) {
    if (acc.matches < 10) continue;
    const [lowerBound] = wilsonScoreInterval(acc.wins, acc.matches);
    if (best && lowerBound <= best.lowerBound) continue;
    const item = items.find((i) => i.id === itemId);
    if (item?.name) best = { name: item.name, winRate: acc.wins / acc.matches, lowerBound };
  }
  return best;
}

export const itemsPageOptions = {
  beforeLoad: redirectAnalyticsTab,
  component: lazyRouteComponent(() => import("./ItemsPage"), "ItemsPage"),
  // The hero filter lives in the URL under nuqs; read it here so the loader warms the hero the page will show.
  loaderDeps: ({ search }: { search: Record<string, unknown> }) => {
    const hero = (search as { hero?: unknown }).hero;
    return { heroId: typeof hero === "number" && Number.isInteger(hero) ? hero : null };
  },
  loader: async ({
    context: { queryClient, preferences },
    deps,
    location,
  }: {
    context: RouterContext;
    deps: { heroId: number | null };
    location: { pathname: string };
  }) => {
    const tab = analyticsTabFromPath("items", location.pathname);
    const [{ itemUpgradesQueryOptions, loadSeasons }, { itemStatsQueryOptions }, flow, combos] = await Promise.all([
      import("~/queries/asset-queries"),
      import("~/queries/item-stats-query"),
      import("~/queries/item-flow-query"),
      import("~/queries/item-permutation-query"),
    ]);
    const seasons = await loadSeasons(queryClient);
    const range = defaultUnixRange(seasons, preferences.dateFilter);
    const prevRange = defaultPrevUnixRange(seasons, preferences.dateFilter);
    // The page's defaults, as the views put them into their query keys.
    const common = {
      minMatches: 10,
      heroId: deps.heroId,
      minAverageBadge: 91,
      maxAverageBadge: 116,
      gameMode: "normal" as const,
      matchMode: DEFAULT_MATCH_MODE,
    };
    // Every view names items, and the build flow and combos trim their answers by the item list.
    const items = prefetchSafe(queryClient.query({ ...itemUpgradesQueryOptions, staleTime: "static" }));
    const coverage = defaultTemporalCoverage(seasons, preferences.dateFilter);

    if (tab === "build-flow") {
      await prefetchSeed(
        queryClient,
        flow.itemFlowQueryOptions({
          heroIds: deps.heroId !== null ? String(deps.heroId) : undefined,
          gameMode: common.gameMode,
          matchMode: common.matchMode,
          minAverageBadge: common.minAverageBadge,
          maxAverageBadge: common.maxAverageBadge,
          ...range,
          minMatches: common.minMatches,
          phaseIntervalS: 600,
          phaseCount: 4,
          lockedItemIds: [],
          lockedColumns: [],
        }),
        async (data) => {
          const tiers = new Map((await items)?.map((item) => [item.id, item.item_tier ?? 0]));
          return flow.trimItemFlowForDefaultView(data, (itemId) => tiers.get(itemId) ?? 0);
        },
      );
      return { leader: null, coverage };
    }
    if (tab === "item-combos") {
      const combosQuery = { ...common, combSize: 2 };
      const shopable = items.then(combos.shopableItemIds);
      const current = prefetchSeed(
        queryClient,
        combos.itemPermutationStatsQueryOptions({ ...combosQuery, ...range }),
        async (rows) => combos.trimItemCombosForView(rows, await shopable, { count: ITEM_COMBS_TO_SHOW[0] }),
      );
      await Promise.all([
        current,
        prefetchSeed(
          queryClient,
          combos.itemPermutationStatsQueryOptions({ ...combosQuery, ...prevRange }),
          async (rows) => combos.trimItemCombosForView(rows, await shopable, { combos: (await current) ?? [] }),
        ),
      ]);
      return { leader: null, coverage };
    }
    if (tab === "item-purchase-analysis") {
      // With no item picked the view shows its prompt and reads nothing but the item list.
      await items;
      return { leader: null, coverage };
    }

    const itemStatsQuery = { ...common, minBoughtAtS: undefined, maxBoughtAtS: undefined };
    const [stats] = await Promise.all([
      prefetchSafe(
        queryClient.query({ ...itemStatsQueryOptions({ ...itemStatsQuery, ...range }), staleTime: "static" }),
      ),
      prefetchSafe(
        queryClient.query({
          ...itemStatsQueryOptions({
            ...itemStatsQuery,
            ...prevRange,
          }),
          staleTime: "static",
        }),
      ),
    ]);
    // The description names the patch-wide leader, which a hero-filtered table would misrepresent.
    return {
      leader: deps.heroId === null ? findWinRateLeader(stats, await items) : null,
      coverage,
    };
  },
  head: ({
    loaderData,
    match,
  }: {
    loaderData?: { leader: { name: string; winRate: number } | null; coverage?: string };
    match: { pathname: string };
  }) => {
    const tab = analyticsTabFromPath("items", match.pathname);
    const view = ANALYTICS_VIEWS.items[tab];
    // The leader is the win-rate table's headline; the other views are about something else.
    const leader = tab === "item-stats" ? loaderData?.leader : null;
    const lead = leader ? ` Most reliable this patch: ${leader.name}, ${(leader.winRate * 100).toFixed(1)}%.` : "";
    return seo({
      title: pageTitle(view.title),
      description: view.description + lead,
      path: match.pathname.replace(/\/$/, ""),
      jsonLd: datasetJsonLd({
        name: view.title,
        description: view.description,
        path: match.pathname.replace(/\/$/, ""),
        keywords: ["Deadlock", "item win rates", "build stats", "item combos"],
        variableMeasured: ["win rate", "pick rate", "matches played"],
        apiPath: "/v1/analytics/item-stats",
        // The loader's default range feeds the win-rate table only; the other views pick their own windows.
        temporalCoverage: tab === "item-stats" ? loaderData?.coverage : undefined,
      }),
    });
  },
};
