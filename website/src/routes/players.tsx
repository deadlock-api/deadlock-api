import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { PlayerScoreboardSortByEnum } from "deadlock_api_client";
import { parseAsInteger, parseAsStringLiteral, useQueryState } from "nuqs";
import { lazy, Suspense } from "react";

import { ChunkErrorBoundary } from "~/components/ChunkErrorBoundary";
import { Filter } from "~/components/Filter";
import { LoadingLogo } from "~/components/LoadingLogo";
import { ScoreboardTable } from "~/components/player-scoreboard/ScoreboardTable";
import { ALL_SORT_BY_VALUES } from "~/components/player-scoreboard/sort-options";
import { QueryRenderer } from "~/components/QueryRenderer";
import { ResponsiveTabsList } from "~/components/ResponsiveTabsList";
import { DEFAULT_MATCH_MODE } from "~/components/selectors/MatchModeSelector";
import { Tabs, TabsContent } from "~/components/ui/tabs";
import { useDateRangeState } from "~/hooks/useDateRangeState";
import { useModeState } from "~/hooks/useModeState";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { getEffectiveRankRange } from "~/lib/game-mode";
import { prefetchSafe } from "~/lib/prefetch-safe";
import { defaultUnixRange } from "~/lib/seasons";
import { seo } from "~/lib/seo";
import { loadSeasons } from "~/queries/asset-queries";
import { playerScoreboardQueryOptions } from "~/queries/player-scoreboard-query";
import { steamProfileBatches, steamProfilesQueryOptions } from "~/queries/steam-queries";

const PlayerStatsDistributionCharts = lazy(() =>
  import("~/components/players-page/PlayerStatsDistributionCharts").then((m) => ({
    default: m.PlayerStatsDistributionCharts,
  })),
);

const MAX_ENTRIES = 1000;

export const Route = createFileRoute("/players")({
  component: PlayersPage,
  // The hero filter lives in the URL under nuqs; read it here so the loader warms the board the page will show.
  loaderDeps: ({ search }) => {
    const hero = (search as { hero?: unknown }).hero;
    return { heroId: typeof hero === "number" && Number.isInteger(hero) ? hero : undefined };
  },
  loader: async ({ context: { queryClient }, deps }) => {
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
  head: () =>
    seo({
      title: "Deadlock Player Analytics: Scoreboard & Stat Distributions",
      description: "Top player scores and stat distributions across the Deadlock community.",
      path: "/players",
    }),
});

function PlayersPage() {
  const [tab, setTab] = useQueryState(
    "tab",
    parseAsStringLiteral(["scoreboard", "stats-metrics"] as const).withDefault("scoreboard"),
  );
  const [sortBy, setSortBy] = useQueryState(
    "sort_by",
    parseAsStringLiteral(ALL_SORT_BY_VALUES as [string, ...string[]]).withDefault("kills"),
  );
  const [sortDirection, setSortDirection] = useQueryState(
    "sort_dir",
    parseAsStringLiteral(["desc", "asc"] as const).withDefault("desc"),
  );
  const { mode, setMode, gameMode, matchMode } = useModeState();
  const [heroId, setHeroId] = useQueryState("hero", parseAsInteger);
  const [minMatches, setMinMatches] = useQueryState("min_matches", parseAsInteger.withDefault(0));
  const [minRankId, setMinRankId] = useQueryState("min_rank", parseAsInteger.withDefault(0));
  const [maxRankId, setMaxRankId] = useQueryState("max_rank", parseAsInteger.withDefault(116));
  const { startDate, endDate, handleDateChange } = useDateRangeState();
  const { minUnixTimestamp, maxUnixTimestamp } = useNormalizedTimeRange(startDate, endDate);

  const { effectiveMinRankId, effectiveMaxRankId } = getEffectiveRankRange(mode, minRankId, maxRankId);

  const scoreboardQuery = useQuery(
    playerScoreboardQueryOptions({
      sortBy: sortBy as PlayerScoreboardSortByEnum,
      sortDirection: sortDirection as "desc" | "asc",
      gameMode,
      matchMode,
      heroId: heroId ?? undefined,
      minMatches,
      minAverageBadge: effectiveMinRankId,
      maxAverageBadge: effectiveMaxRankId,
      minUnixTimestamp: minUnixTimestamp ?? 0,
      maxUnixTimestamp,
      start: 0,
      limit: MAX_ENTRIES,
    }),
  );

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Player Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">Player performance and stat distributions</p>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Compare top player performances and view percentile distributions across a range of performance metrics.
          Filter by hero, rank, and patch.
        </p>
      </div>

      <Filter.Root>
        <Filter.ModeWithRank
          mode={mode}
          onModeChange={setMode}
          minRank={minRankId}
          maxRank={maxRankId}
          onRankChange={(min, max) => {
            setMinRankId(min);
            setMaxRankId(max);
          }}
        />
        <Filter.Hero value={heroId} onChange={setHeroId} allowNull label="Hero" />
        <Filter.SeasonPatchDate startDate={startDate} endDate={endDate} onDateChange={handleDateChange} />
        {tab === "scoreboard" && <Filter.MinMatches value={minMatches} onChange={setMinMatches} min={1} />}
      </Filter.Root>

      <Tabs value={tab ?? undefined} onValueChange={(value) => setTab(value as typeof tab)} className="tabs-nav w-full">
        <ResponsiveTabsList
          ariaLabel="Player analytics sections"
          value={tab ?? undefined}
          onValueChange={(value) => setTab(value as typeof tab)}
          options={[
            { value: "scoreboard", label: "Scoreboard" },
            { value: "stats-metrics", label: "Stats Metrics" },
          ]}
        />

        <TabsContent value="scoreboard">
          <div className="flex flex-col gap-4">
            <h2 className="sr-only">Player Scoreboard</h2>
            <QueryRenderer
              query={scoreboardQuery}
              loadingFallback={
                <div className="flex items-center justify-center py-24">
                  <LoadingLogo />
                </div>
              }
              errorFallback={(error) => (
                <div className="py-8 text-center text-sm text-destructive">
                  Failed to load scoreboard: {error.message}
                </div>
              )}
            >
              {(data) => (
                <ScoreboardTable
                  entries={data}
                  sortBy={sortBy}
                  sortDirection={sortDirection}
                  onSortByChange={setSortBy}
                  onSortDirectionChange={setSortDirection}
                />
              )}
            </QueryRenderer>
          </div>
        </TabsContent>

        <TabsContent value="stats-metrics">
          <div className="flex flex-col gap-4">
            <h2 className="sr-only">Player Stats Metrics</h2>
            <ChunkErrorBoundary>
              <Suspense fallback={<LoadingLogo />}>
                <PlayerStatsDistributionCharts
                  heroId={heroId}
                  gameMode={gameMode}
                  matchMode={matchMode}
                  minRankId={effectiveMinRankId}
                  maxRankId={effectiveMaxRankId}
                  minDate={startDate}
                  maxDate={endDate}
                />
              </Suspense>
            </ChunkErrorBoundary>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
