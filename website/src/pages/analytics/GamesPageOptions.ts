import { lazyRouteComponent } from "@tanstack/react-router";
import type { AnalyticsApiGameStatsRequest } from "deadlock_api_client";

import { analyticsTabFromPath, ANALYTICS_VIEWS, redirectAnalyticsTab } from "~/lib/analytics-tabs";
import { ALL_RANKS_BADGES, DEFAULT_MATCH_MODE } from "~/lib/game-mode";
import { prefetchCached } from "~/lib/prefetch-safe";
import { defaultPeriodLabel, defaultPrevUnixRange, defaultTemporalCoverage, defaultUnixRange } from "~/lib/seasons";
import { datasetJsonLd, pageTitle, seo } from "~/lib/seo";
import { formatClock } from "~/lib/stat-format";
import type { RouterContext } from "~/router";

export const gamesPageOptions = {
  beforeLoad: redirectAnalyticsTab,
  component: lazyRouteComponent(() => import("./GamesPage"), "Games"),
  loader: async ({
    context: { queryClient, preferences },
    location,
  }: {
    context: RouterContext;
    location: { pathname: string };
  }) => {
    const tab = analyticsTabFromPath("games", location.pathname);
    const [{ buffInfoQueryOptions, loadSeasons }, { gameStatsQueryOptions }] = await Promise.all([
      import("~/queries/asset-queries"),
      import("~/queries/games-query"),
    ]);
    const seasons = await loadSeasons(queryClient);
    const range = defaultUnixRange(seasons, preferences.dateFilter);
    // The filters every view passes on, to the game stats and to the buff stats and performance curve alike.
    const filters = {
      gameMode: "normal",
      matchMode: DEFAULT_MATCH_MODE,
      ...range,
      ...ALL_RANKS_BADGES,
    } as const;
    const baseParams: AnalyticsApiGameStatsRequest = filters;
    const gameStats = (params: AnalyticsApiGameStatsRequest) =>
      prefetchCached(queryClient, gameStatsQueryOptions(params));
    // What each view's first render reads, on its default filters (the page's own defaults: this metric, this
    // interval), so the server HTML carries the numbers rather than the views' loading states.
    const prefetches: Promise<unknown>[] = [];
    // The overview's headline game length, which its meta description quotes.
    let overall: ReturnType<typeof gameStats> | undefined;
    if (tab === "overview") {
      const prevRange = defaultPrevUnixRange(seasons, preferences.dateFilter);
      overall = gameStats({ ...baseParams, bucket: "no_bucket" });
      prefetches.push(overall, gameStats({ ...baseParams, ...prevRange, bucket: "no_bucket" }));
    } else if (tab === "over-time") {
      prefetches.push(gameStats({ ...baseParams, bucket: "start_time_day" }));
    } else if (tab === "by-rank") {
      prefetches.push(gameStats({ ...baseParams, bucket: "avg_badge" }));
    } else {
      const { playerPerformanceCurveQueryOptions } = await import("~/queries/player-performance-curve-query");
      prefetches.push(gameStats({ ...baseParams, bucket: "no_bucket" }));
      if (tab === "economy") {
        prefetches.push(
          gameStats({ ...baseParams, bucket: "avg_badge" }),
          prefetchCached(queryClient, playerPerformanceCurveQueryOptions({ ...filters, resolution: 5 })),
        );
      } else if (tab === "combat") {
        prefetches.push(prefetchCached(queryClient, playerPerformanceCurveQueryOptions({ ...filters, resolution: 0 })));
      } else {
        const { buffStatsQueryOptions } = await import("~/queries/buff-stats-query");
        prefetches.push(
          prefetchCached(queryClient, buffStatsQueryOptions(filters)),
          prefetchCached(queryClient, buffInfoQueryOptions),
          prefetchCached(queryClient, playerPerformanceCurveQueryOptions({ ...filters, resolution: 0 })),
        );
      }
    }
    // The server waits, so its HTML carries the numbers. In the browser a tab click does not: the view shows its own
    // loading state instead of the navigation waiting on the API.
    const { preloadGamesView } = await import("./games-views");
    if (typeof window === "undefined") {
      // The view's code too: a lazy view would suspend and stream its loading state ahead of the numbers.
      await Promise.all([...prefetches, preloadGamesView(tab)]);
    } else {
      // A tab click waits for the view's code only (usually already loaded on hover or focus of the tab), so the old
      // panel stays until the new one can render, rather than collapsing to the chunk's fallback first.
      await preloadGamesView(tab);
    }
    // Read on the server only, where the stats were awaited above; the browser keeps the server's head.
    const avgDurationS = typeof window === "undefined" ? (await overall)?.[0]?.avg_duration_s : undefined;
    return {
      coverage: defaultTemporalCoverage(seasons, preferences.dateFilter),
      avgDurationS,
      period: defaultPeriodLabel(seasons, preferences.dateFilter),
    };
  },
  head: ({
    loaderData,
    match,
  }: {
    loaderData?: { coverage?: string; avgDurationS?: number; period: string };
    match: { pathname: string };
  }) => {
    const tab = analyticsTabFromPath("games", match.pathname);
    const view = ANALYTICS_VIEWS.games[tab];
    const avgDurationS = tab === "overview" ? loaderData?.avgDurationS : undefined;
    const lead = avgDurationS ? ` The average game lasts ${formatClock(avgDurationS)} ${loaderData?.period}.` : "";
    const path = match.pathname.replace(/\/$/, "");
    const dataset = datasetJsonLd({
      name: view.title,
      description: view.description,
      path,
      keywords: ["Deadlock", "match stats", "average kills", "souls", "game length"],
      variableMeasured: ["match length", "kills", "deaths", "souls", "net worth"],
      apiPath: "/v1/analytics/game-stats",
      // The loader's default range feeds the overview only; the other views pick their own windows.
      temporalCoverage: tab === "overview" ? loaderData?.coverage : undefined,
    });
    return seo({
      title: pageTitle(view.title),
      description: view.description + lead,
      path,
      jsonLd: dataset,
    });
  },
};
