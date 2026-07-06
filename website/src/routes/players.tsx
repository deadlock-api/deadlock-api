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
import { parseAsGameMode } from "~/components/selectors/GameModeSelector";
import { Tabs, TabsContent } from "~/components/ui/tabs";
import { CACHE_DURATIONS } from "~/constants/cache";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { api } from "~/lib/api";
import { DEFAULT_DATE_RANGE } from "~/lib/constants";
import { parseAsDayjsRange } from "~/lib/nuqs-parsers";
import { prefetchSafe } from "~/lib/prefetch-safe";
import { seo } from "~/lib/seo";
import { normalizeUnixCeil, normalizeUnixFloor } from "~/lib/time-normalize";
import { playerScoreboardQueryOptions } from "~/queries/player-scoreboard-query";
import { queryKeys } from "~/queries/query-keys";

const PlayerStatsDistributionCharts = lazy(() =>
  import("~/components/players-page/PlayerStatsDistributionCharts").then((m) => ({
    default: m.PlayerStatsDistributionCharts,
  })),
);

const STEAM_BATCH_SIZE = 500;
const MAX_ENTRIES = 1000;

function chunkIds(ids: number[], size: number): number[][] {
  const chunks: number[][] = [];
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
  return chunks;
}

export const Route = createFileRoute("/players")({
  component: PlayersPage,
  loader: async ({ context: { queryClient } }) => {
    const scoreboard = await prefetchSafe(
      queryClient.ensureQueryData(
        playerScoreboardQueryOptions({
          sortBy: "kills" as PlayerScoreboardSortByEnum,
          sortDirection: "desc",
          gameMode: "normal",
          minMatches: 0,
          minAverageBadge: 0,
          maxAverageBadge: 116,
          minUnixTimestamp: normalizeUnixFloor(DEFAULT_DATE_RANGE[0]) ?? 0,
          maxUnixTimestamp: normalizeUnixCeil(DEFAULT_DATE_RANGE[1]),
          start: 0,
          limit: MAX_ENTRIES,
        }),
      ),
    );
    const accountIds = (scoreboard ?? []).map((e) => e.account_id).filter((id): id is number => id != null);
    await Promise.all(
      chunkIds(accountIds, STEAM_BATCH_SIZE).map((batch) =>
        prefetchSafe(
          queryClient.ensureQueryData({
            queryKey: queryKeys.steam.profiles(batch),
            queryFn: async () => {
              const response = await api.steam_api.steam({ accountIds: batch });
              const map: Record<number, { personaname: string; avatar: string; profileurl: string }> = {};
              for (const profile of response.data) {
                map[profile.account_id] = {
                  personaname: profile.personaname,
                  avatar: profile.avatar,
                  profileurl: profile.profileurl,
                };
              }
              return map;
            },
            staleTime: CACHE_DURATIONS.ONE_DAY,
          }),
        ),
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
  const [gameMode, setGameMode] = useQueryState("game_mode", parseAsGameMode);
  const [heroId, setHeroId] = useQueryState("hero", parseAsInteger);
  const [minMatches, setMinMatches] = useQueryState("min_matches", parseAsInteger.withDefault(0));
  const [minRankId, setMinRankId] = useQueryState("min_rank", parseAsInteger.withDefault(0));
  const [maxRankId, setMaxRankId] = useQueryState("max_rank", parseAsInteger.withDefault(116));
  const [dateRange, setDateRange] = useQueryState("date_range", parseAsDayjsRange.withDefault(DEFAULT_DATE_RANGE));
  const startDate = dateRange[0] ?? DEFAULT_DATE_RANGE[0];
  const endDate = dateRange[1] ?? DEFAULT_DATE_RANGE[1];
  const { minUnixTimestamp, maxUnixTimestamp } = useNormalizedTimeRange(startDate, endDate);

  const isStreetBrawl = gameMode === "street_brawl";
  const effectiveMinRankId = isStreetBrawl ? undefined : minRankId;
  const effectiveMaxRankId = isStreetBrawl ? undefined : maxRankId;

  const scoreboardQuery = useQuery(
    playerScoreboardQueryOptions({
      sortBy: sortBy as PlayerScoreboardSortByEnum,
      sortDirection: sortDirection as "desc" | "asc",
      gameMode: gameMode ?? undefined,
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
        <Filter.GameMode value={gameMode} onChange={setGameMode} />
        <Filter.Hero value={heroId} onChange={setHeroId} allowNull label="Hero" />
        {!isStreetBrawl && (
          <Filter.RankRange
            minRank={minRankId}
            maxRank={maxRankId}
            onRankChange={(min, max) => {
              setMinRankId(min);
              setMaxRankId(max);
            }}
          />
        )}
        <Filter.PatchOrDate startDate={startDate} endDate={endDate} onDateChange={(s, e) => setDateRange([s, e])} />
      </Filter.Root>

      <Tabs value={tab ?? undefined} onValueChange={(value) => setTab(value as typeof tab)} className="tabs-nav w-full">
        <ResponsiveTabsList
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
            <div className="flex items-center justify-end gap-2">
              <Filter.MinMatches value={minMatches} onChange={setMinMatches} min={1} />
            </div>
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
