import { lazyRouteComponent } from "@tanstack/react-router";

import { analyticsView, redirectAnalyticsTab } from "~/lib/analytics-tabs";
import { DEFAULT_MATCH_MODE } from "~/lib/game-mode";
import { prefetchSafe } from "~/lib/prefetch-safe";
import { defaultUnixRange } from "~/lib/seasons";
import { pageTitle, seo } from "~/lib/seo";
import type { RouterContext } from "~/router";

export const MAX_ENTRIES = 1000;
/** Without a floor, a win rate or per-match sort fills the board with players who played once and won. */
export const DEFAULT_MIN_MATCHES = 10;

export const playersPageOptions = {
  beforeLoad: redirectAnalyticsTab,
  component: lazyRouteComponent(() => import("./PlayersPage"), "PlayersPage"),
  // The hero filter lives in the URL under nuqs; read it here so the loader warms the board the page will show.
  loaderDeps: ({ search }: { search: Record<string, unknown> }) => {
    const hero = (search as { hero?: unknown }).hero;
    return { heroId: typeof hero === "number" && Number.isInteger(hero) ? hero : undefined };
  },
  loader: async ({
    context: { queryClient, preferences },
    deps,
  }: {
    context: RouterContext;
    deps: { heroId: number | undefined };
  }) => {
    const [{ loadSeasons }, { playerScoreboardQueryOptions }, { steamProfileBatches, steamProfilesQueryOptions }] =
      await Promise.all([
        import("~/queries/asset-queries"),
        import("~/queries/player-scoreboard-query"),
        import("~/queries/steam-queries"),
      ]);
    const range = defaultUnixRange(await loadSeasons(queryClient), preferences.dateFilter);
    const scoreboard = await prefetchSafe(
      queryClient.query({
        ...playerScoreboardQueryOptions({
          sortBy: "kills",
          sortDirection: "desc",
          gameMode: "normal",
          matchMode: DEFAULT_MATCH_MODE,
          heroId: deps.heroId,
          minMatches: DEFAULT_MIN_MATCHES,
          minAverageBadge: 0,
          maxAverageBadge: 116,
          ...range,
          start: 0,
          limit: MAX_ENTRIES,
        }),
        staleTime: "static",
      }),
    );
    const accountIds = (scoreboard ?? []).map((e) => e.account_id).filter((id): id is number => id != null);
    await Promise.all(
      steamProfileBatches(accountIds).map((batch) =>
        prefetchSafe(queryClient.query({ ...steamProfilesQueryOptions(batch), staleTime: "static" })),
      ),
    );
  },
  head: ({ match }: { match: { pathname: string } }) => {
    const view = analyticsView("players", match.pathname);
    return seo({
      title: pageTitle(view.title),
      description: view.description,
      path: match.pathname.replace(/\/$/, ""),
    });
  },
};
