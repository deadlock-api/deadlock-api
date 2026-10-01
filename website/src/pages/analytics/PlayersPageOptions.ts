import { lazyRouteComponent } from "@tanstack/react-router";

import { analyticsView, redirectAnalyticsTab } from "~/lib/analytics-tabs";
import { compareCardUrl, compareFilterSearch, type CompareFilterSearch, compareShareParams } from "~/lib/compare-share";
import { DEFAULT_MATCH_MODE } from "~/lib/game-mode";
import { comparisonVerdict, parseCompareIds, SCORED_STAT_COUNT, settledAggregates } from "~/lib/player-compare";
import { prefetchSafe } from "~/lib/prefetch-safe";
import { defaultUnixRange } from "~/lib/seasons";
import { pageTitle, seo, SITE_URL } from "~/lib/seo";
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

/** The URL's `players` as TanStack reads it: one id parses as a number, a list stays the comma string nuqs wrote. */
function searchAccountIds(value: unknown): number[] {
  if (typeof value === "number") return [value];
  if (typeof value !== "string") return [];
  return value.split(",").map(Number);
}

/**
 * The compare tab warms what its first HTML shows on the URL's filters: the players' names and avatars, their ranks
 * and their hero stats, or, before anyone is picked, the top player the add button offers.
 */
export const comparePageOptions = {
  ...playersPageOptions,
  component: lazyRouteComponent(() => import("./PlayersComparePage"), "PlayersComparePage"),
  loaderDeps: ({ search }: { search: Record<string, unknown> }) => ({
    accountIds: searchAccountIds(search.players),
    filters: compareFilterSearch(search),
  }),
  loader: async ({
    context: { queryClient, preferences },
    deps,
  }: {
    context: RouterContext;
    deps: { accountIds: number[]; filters: CompareFilterSearch };
  }) => {
    const [
      { loadSeasons },
      compareQueries,
      { steamProfileQueryOptions, trackerHeroStatsQueryOptions },
      { playerScoreboardQueryOptions },
      { playerStatsMetricsQueryOptions },
    ] = await Promise.all([
      import("~/queries/asset-queries"),
      import("~/queries/player-compare-queries"),
      import("~/queries/tracker-queries"),
      import("~/queries/player-scoreboard-query"),
      import("~/queries/player-stats-metrics-query"),
    ]);
    // Loaded even when the URL names its dates: the seasons register the exact patch boundaries, without which a pinned
    // season start (a patch instant) rounds down to midnight, and the server would ask for other data (another query
    // key) than the page, which then renders its skeletons over the server's numbers.
    const seasons = await loadSeasons(queryClient);
    const { filters } = await compareQueries.resolveCompareFilters(deps.filters, async () =>
      defaultUnixRange(seasons, preferences.dateFilter),
    );
    const accountIds = parseCompareIds(deps.accountIds);
    if (accountIds.length === 0) {
      // The "Add top player" button's pick.
      await prefetchSafe(
        queryClient.query({
          ...playerScoreboardQueryOptions(compareQueries.compareSuggestionsParams(filters)),
          staleTime: "static",
        }),
      );
      return { names: [], range: undefined, verdict: null };
    }
    // One profile query a player, as the page reads them; the metrics too, which the head's verdict scores on.
    const [profileList, ranks, rows, metrics] = await Promise.all([
      Promise.all(
        accountIds.map((id) =>
          prefetchSafe(queryClient.query({ ...steamProfileQueryOptions(id), staleTime: "static" })),
        ),
      ),
      prefetchSafe(queryClient.query({ ...compareQueries.playerRanksQueryOptions(accountIds), staleTime: "static" })),
      prefetchSafe(
        queryClient.query({
          ...trackerHeroStatsQueryOptions(compareQueries.compareHeroStatsParams(accountIds, filters)),
          staleTime: "static",
        }),
      ),
      // The link preview's verdict needs them, and only a crawler reads the server's head: in the browser a navigation
      // (a player added, a filter changed) does not wait on them, and the page shows its placeholders instead.
      typeof window === "undefined"
        ? Promise.all(
            accountIds.map((id) =>
              prefetchSafe(
                queryClient.query({
                  ...playerStatsMetricsQueryOptions(compareQueries.compareMetricsParams(filters, id)),
                  staleTime: "static",
                }),
              ),
            ),
          )
        : Promise.resolve(
            accountIds.map((id) =>
              queryClient.getQueryData(
                playerStatsMetricsQueryOptions(compareQueries.compareMetricsParams(filters, id)).queryKey,
              ),
            ),
          ),
    ]);
    const names = accountIds.map((id, index) => profileList[index]?.personaname ?? `Player ${id}`);
    // Scored as the share card scores it; without the stats there is no verdict rather than a wrong one.
    const verdict = rows
      ? comparisonVerdict(
          names,
          settledAggregates(
            accountIds,
            rows,
            accountIds.map((id, index) => ({
              badge: ranks?.find((rank) => rank.account_id === id)?.badge,
              metrics: metrics[index],
            })),
          ),
          filters.gameMode,
        )
      : null;

    // For the page head: a shared link previews as "A vs B", not as the generic tab.
    return {
      names,
      verdict,
      // The dates the page shows, so the preview card counts the same matches when the URL names none (the page
      // falls back to the reader's date preference, the card on its own would fall back to the season).
      range: { minUnixTimestamp: filters.minUnixTimestamp, maxUnixTimestamp: filters.maxUnixTimestamp },
    };
  },
  head: ({
    match,
    loaderData,
  }: {
    match: { pathname: string; search: Record<string, unknown> };
    loaderData?: {
      names: string[];
      range: { minUnixTimestamp?: number; maxUnixTimestamp?: number } | undefined;
      /** "A wins 10 of 19 stats against B (5).", when two players have matches. */
      verdict: string | null;
    };
  }) => {
    const view = analyticsView("players", match.pathname);
    const names = loaderData?.names ?? [];
    const params = compareShareParams(match.search, loaderData?.range);
    const path = match.pathname.replace(/\/$/, "");
    return seo({
      title: names.length > 0 ? pageTitle(`${names.join(" vs ")}: Deadlock Player Comparison`) : pageTitle(view.title),
      description:
        names.length > 1
          ? loaderData?.verdict
            ? `${loaderData.verdict} Deadlock head to head: win rate, KDA, souls, damage and more, ranked against everyone.`
            : `${names.join(" vs ")}: who wins which stat in Deadlock. Head to head on up to ${SCORED_STAT_COUNT} stats, ranked against everyone.`
          : view.description,
      path,
      // Canonical stays the bare page (one indexed page, not one per pairing); a shared link previews as itself.
      shareUrl: names.length > 0 ? `${SITE_URL}${path}?${params}` : undefined,
      ogImage: compareCardUrl(params),
    });
  },
};
