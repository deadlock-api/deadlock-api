import { lazyRouteComponent } from "@tanstack/react-router";
import type { AnalyticsApiGameStatsRequest } from "deadlock_api_client";

import { analyticsTabFromPath, ANALYTICS_VIEWS, redirectAnalyticsTab } from "~/lib/analytics-tabs";
import { DEFAULT_MATCH_MODE } from "~/lib/game-mode";
import { prefetchSafe } from "~/lib/prefetch-safe";
import { MAX_BADGE } from "~/lib/rank-utils";
import { defaultPrevUnixRange, defaultTemporalCoverage, defaultUnixRange } from "~/lib/seasons";
import { datasetJsonLd, pageTitle, seo } from "~/lib/seo";
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
      minAverageBadge: 0,
      maxAverageBadge: MAX_BADGE,
    } as const;
    const baseParams: AnalyticsApiGameStatsRequest = filters;
    const gameStats = (params: AnalyticsApiGameStatsRequest) =>
      prefetchSafe(queryClient.query({ ...gameStatsQueryOptions(params), staleTime: "static" }));
    // What each view's first render reads, on its default filters (the page's own defaults: this metric, this
    // interval), so the server HTML carries the numbers rather than the views' loading states.
    const prefetches: Promise<unknown>[] = [];
    if (tab === "overview") {
      const prevRange = defaultPrevUnixRange(seasons, preferences.dateFilter);
      prefetches.push(
        gameStats({ ...baseParams, bucket: "no_bucket" }),
        gameStats({ ...baseParams, ...prevRange, bucket: "no_bucket" }),
      );
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
          prefetchSafe(
            queryClient.query({
              ...playerPerformanceCurveQueryOptions({ ...filters, resolution: 5 }),
              staleTime: "static",
            }),
          ),
        );
      } else if (tab === "combat") {
        prefetches.push(
          prefetchSafe(
            queryClient.query({
              ...playerPerformanceCurveQueryOptions({ ...filters, resolution: 0 }),
              staleTime: "static",
            }),
          ),
        );
      } else {
        const { buffStatsQueryOptions } = await import("~/queries/buff-stats-query");
        prefetches.push(
          prefetchSafe(queryClient.query({ ...buffStatsQueryOptions(filters), staleTime: "static" })),
          prefetchSafe(queryClient.query({ ...buffInfoQueryOptions, staleTime: "static" })),
          prefetchSafe(
            queryClient.query({
              ...playerPerformanceCurveQueryOptions({ ...filters, resolution: 0 }),
              staleTime: "static",
            }),
          ),
        );
      }
    }
    // The server waits, so its HTML carries the numbers. In the browser a tab click does not: the view shows its own
    // loading state instead of the navigation waiting on the API.
    if (typeof window === "undefined") {
      // The view's code too: a lazy view would suspend and stream its loading state ahead of the numbers.
      const { preloadGamesView } = await import("./games-views");
      await Promise.all([...prefetches, preloadGamesView(tab)]);
    }
    return { coverage: defaultTemporalCoverage(seasons, preferences.dateFilter) };
  },
  head: ({ loaderData, match }: { loaderData?: { coverage?: string }; match: { pathname: string } }) => {
    const tab = analyticsTabFromPath("games", match.pathname);
    const view = ANALYTICS_VIEWS.games[tab];
    const dataset = datasetJsonLd({
      name: view.title,
      description: view.description,
      path: match.pathname.replace(/\/$/, ""),
      keywords: ["Deadlock", "match stats", "average kills", "souls", "game length"],
      variableMeasured: ["match length", "kills", "deaths", "souls", "net worth"],
      apiPath: "/v1/analytics/game-stats",
      // The loader's default range feeds the overview only; the other views pick their own windows.
      temporalCoverage: tab === "overview" ? loaderData?.coverage : undefined,
    });
    return seo({
      title: pageTitle(view.title),
      description: view.description,
      path: match.pathname.replace(/\/$/, ""),
      jsonLd: dataset,
    });
  },
};
