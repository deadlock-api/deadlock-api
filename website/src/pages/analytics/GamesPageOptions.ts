import { lazyRouteComponent } from "@tanstack/react-router";
import type { AnalyticsApiGameStatsRequest } from "deadlock_api_client";

import { analyticsTabFromPath, ANALYTICS_VIEWS, redirectAnalyticsTab } from "~/lib/analytics-tabs";
import { DEFAULT_MATCH_MODE } from "~/lib/game-mode";
import { prefetchSafe } from "~/lib/prefetch-safe";
import { defaultPrevUnixRange, defaultTemporalCoverage, defaultUnixRange } from "~/lib/seasons";
import { datasetJsonLd, pageTitle, seo } from "~/lib/seo";
import type { RouterContext } from "~/router";

const MATCH_LENGTH_ANSWER = "A typical Deadlock match lasts around 30-40 minutes, varying by game mode and skill.";

export const gamesPageOptions = {
  beforeLoad: redirectAnalyticsTab,
  component: lazyRouteComponent(() => import("./GamesPage"), "Games"),
  loader: async ({ context: { queryClient, preferences } }: { context: RouterContext }) => {
    const [{ loadSeasons }, { gameStatsQueryOptions }] = await Promise.all([
      import("~/queries/asset-queries"),
      import("~/queries/games-query"),
    ]);
    const seasons = await loadSeasons(queryClient);
    const range = defaultUnixRange(seasons, preferences.dateFilter);
    const prevRange = defaultPrevUnixRange(seasons, preferences.dateFilter);
    const baseParams: AnalyticsApiGameStatsRequest = {
      gameMode: "normal",
      matchMode: DEFAULT_MATCH_MODE,
      ...range,
      minAverageBadge: 0,
      maxAverageBadge: 116,
    };
    await Promise.all([
      prefetchSafe(
        queryClient.query({ ...gameStatsQueryOptions({ ...baseParams, bucket: "no_bucket" }), staleTime: "static" }),
      ),
      prefetchSafe(
        queryClient.query({
          ...gameStatsQueryOptions({
            ...baseParams,
            ...prevRange,
            bucket: "no_bucket",
          }),
          staleTime: "static",
        }),
      ),
    ]);
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
    // The match-length question belongs to the overview; repeating it on every view makes them duplicates.
    const faq = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "How long is a Deadlock match?",
          acceptedAnswer: { "@type": "Answer", text: MATCH_LENGTH_ANSWER },
        },
      ],
    };
    return seo({
      title: pageTitle(view.title),
      description: view.description,
      path: match.pathname.replace(/\/$/, ""),
      jsonLd: tab === "overview" ? [dataset, faq] : dataset,
    });
  },
};
