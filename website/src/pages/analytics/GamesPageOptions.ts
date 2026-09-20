import { lazyRouteComponent } from "@tanstack/react-router";
import type { AnalyticsApiGameStatsRequest } from "deadlock_api_client";

import { DEFAULT_MATCH_MODE } from "~/components/domain/selectors/MatchModeSelector";
import { analyticsPageTitle, redirectAnalyticsTab } from "~/lib/analytics-tabs";
import { prefetchSafe } from "~/lib/prefetch-safe";
import { defaultPrevUnixRange, defaultUnixRange } from "~/lib/seasons";
import { seo } from "~/lib/seo";
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
      prefetchSafe(queryClient.ensureQueryData(gameStatsQueryOptions({ ...baseParams, bucket: "no_bucket" }))),
      prefetchSafe(
        queryClient.ensureQueryData(
          gameStatsQueryOptions({
            ...baseParams,
            ...prevRange,
            bucket: "no_bucket",
          }),
        ),
      ),
    ]);
  },
  head: ({ match }: { match: { pathname: string } }) =>
    seo({
      title: analyticsPageTitle(match.pathname, "Deadlock Game Stats: Match Trends, Avg Kills & Souls by Rank"),
      description:
        "Deadlock match stats by rank and game mode: average match length, kills, souls, and objective timings. See how long a typical Deadlock game lasts.",
      path: match.pathname.replace(/\/$/, ""),
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "Dataset",
          name: "Deadlock Match Stats",
          description:
            "Average match statistics for Deadlock, including average kills, souls, and game length, calculated from tracked matches. Filterable by rank, patch, and game mode.",
          url: `https://deadlock-api.com${match.pathname.replace(/\/$/, "")}`,
          keywords: ["Deadlock", "match stats", "average kills", "souls", "game length"],
          creator: { "@type": "Organization", name: "Deadlock API", url: "https://deadlock-api.com" },
          isAccessibleForFree: true,
          license: "https://github.com/deadlock-api/deadlock-api/blob/master/LICENSE",
        },
        {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: "How long is a Deadlock match?",
              acceptedAnswer: { "@type": "Answer", text: MATCH_LENGTH_ANSWER },
            },
          ],
        },
      ],
    }),
};
