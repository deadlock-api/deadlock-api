import { lazyRouteComponent } from "@tanstack/react-router";
import type { PlayerScoreboardSortByEnum } from "deadlock_api_client";

import { DEFAULT_MATCH_MODE } from "~/components/selectors/MatchModeSelector";
import { analyticsPageTitle, redirectAnalyticsTab } from "~/lib/analytics-tabs";
import { prefetchSafe } from "~/lib/prefetch-safe";
import { defaultUnixRange } from "~/lib/seasons";
import { seo } from "~/lib/seo";
import { loadSeasons } from "~/queries/asset-queries";
import { playerScoreboardQueryOptions } from "~/queries/player-scoreboard-query";
import { steamProfileBatches, steamProfilesQueryOptions } from "~/queries/steam-queries";
import type { RouterContext } from "~/router";

export const MAX_ENTRIES = 1000;

export const playersPageOptions = {
  beforeLoad: redirectAnalyticsTab,
  component: lazyRouteComponent(() => import("./PlayersPage"), "PlayersPage"),
  // The hero filter lives in the URL under nuqs; read it here so the loader warms the board the page will show.
  loaderDeps: ({ search }: { search: Record<string, unknown> }) => {
    const hero = (search as { hero?: unknown }).hero;
    return { heroId: typeof hero === "number" && Number.isInteger(hero) ? hero : undefined };
  },
  loader: async ({
    context: { queryClient },
    deps,
  }: {
    context: RouterContext;
    deps: { heroId: number | undefined };
  }) => {
    const range = defaultUnixRange(await loadSeasons(queryClient));
    const scoreboard = await prefetchSafe(
      queryClient.ensureQueryData(
        playerScoreboardQueryOptions({
          sortBy: "kills" as PlayerScoreboardSortByEnum,
          sortDirection: "desc",
          gameMode: "normal",
          matchMode: DEFAULT_MATCH_MODE,
          heroId: deps.heroId,
          minMatches: 0,
          minAverageBadge: 0,
          maxAverageBadge: 116,
          ...range,
          start: 0,
          limit: MAX_ENTRIES,
        }),
      ),
    );
    const accountIds = (scoreboard ?? []).map((e) => e.account_id).filter((id): id is number => id != null);
    await Promise.all(
      steamProfileBatches(accountIds).map((batch) =>
        prefetchSafe(queryClient.ensureQueryData(steamProfilesQueryOptions(batch))),
      ),
    );
  },
  head: ({ match }: { match: { pathname: string } }) =>
    seo({
      title: analyticsPageTitle(match.pathname, "Deadlock Player Analytics: Scoreboard & Stat Distributions"),
      description: "Top player scores and stat distributions across the Deadlock community.",
      path: match.pathname.replace(/\/$/, ""),
    }),
};
