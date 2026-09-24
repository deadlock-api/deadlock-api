import { lazyRouteComponent } from "@tanstack/react-router";

import { analyticsTabFromPath, ANALYTICS_VIEWS, redirectAnalyticsTab } from "~/lib/analytics-tabs";
import { DEFAULT_MATCH_MODE } from "~/lib/game-mode";
import { prefetchSafe } from "~/lib/prefetch-safe";
import { defaultPrevUnixRange, defaultUnixRange } from "~/lib/seasons";
import { pageTitle, seo } from "~/lib/seo";
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
  }: {
    context: RouterContext;
    deps: { heroId: number | null };
  }) => {
    const [{ itemUpgradesQueryOptions, loadSeasons }, { itemStatsQueryOptions }] = await Promise.all([
      import("~/queries/asset-queries"),
      import("~/queries/item-stats-query"),
    ]);
    const seasons = await loadSeasons(queryClient);
    const range = defaultUnixRange(seasons, preferences.dateFilter);
    const prevRange = defaultPrevUnixRange(seasons, preferences.dateFilter);
    const common = {
      minMatches: 10,
      heroId: deps.heroId,
      minAverageBadge: 91,
      maxAverageBadge: 116,
      minBoughtAtS: undefined,
      maxBoughtAtS: undefined,
      gameMode: "normal" as const,
      matchMode: DEFAULT_MATCH_MODE,
    };
    const [stats, , items] = await Promise.all([
      prefetchSafe(queryClient.query({ ...itemStatsQueryOptions({ ...common, ...range }), staleTime: "static" })),
      prefetchSafe(
        queryClient.query({
          ...itemStatsQueryOptions({
            ...common,
            ...prevRange,
          }),
          staleTime: "static",
        }),
      ),
      prefetchSafe(queryClient.query({ ...itemUpgradesQueryOptions, staleTime: "static" })),
    ]);
    // The description names the patch-wide leader, which a hero-filtered table would misrepresent.
    return { leader: deps.heroId === null ? findWinRateLeader(stats, items) : null };
  },
  head: ({
    loaderData,
    match,
  }: {
    loaderData?: { leader: { name: string; winRate: number } | null };
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
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Dataset",
        name: view.title,
        description: view.description,
        url: `https://deadlock-api.com${match.pathname.replace(/\/$/, "")}`,
        keywords: ["Deadlock", "item win rates", "build stats", "item combos"],
        creator: { "@type": "Organization", name: "Deadlock API", url: "https://deadlock-api.com" },
        isAccessibleForFree: true,
        license: "https://github.com/deadlock-api/deadlock-api/blob/master/LICENSE",
      },
    });
  },
};
