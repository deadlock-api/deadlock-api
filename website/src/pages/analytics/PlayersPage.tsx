import { useQuery } from "@tanstack/react-query";
import type { PlayerScoreboardSortByEnum } from "deadlock_api_client";
import { parseAsInteger, parseAsStringLiteral, useQueryState } from "nuqs";
import { lazy, Suspense } from "react";

import { Filter } from "~/components/domain/filters";
import { ScoreboardTable } from "~/components/domain/player-scoreboard/ScoreboardTable";
import { ALL_SORT_BY_VALUES } from "~/components/domain/player-scoreboard/sort-options";
import { ResponsiveTab, ResponsiveTabsList } from "~/components/patterns/navigation/ResponsiveTabsList";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { Section } from "~/components/patterns/page/Section";
import { ChunkErrorBoundary } from "~/components/patterns/states/ChunkErrorBoundary";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { QueryRenderer } from "~/components/patterns/states/QueryRenderer";
import { Tabs, TabsContent } from "~/components/ui/tabs";
import { useAnalyticsTab } from "~/hooks/useAnalyticsTab";
import { useDateRangeState } from "~/hooks/useDateRangeState";
import { useModeState } from "~/hooks/useModeState";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { getEffectiveRankRange } from "~/lib/game-mode";
import { playerScoreboardQueryOptions } from "~/queries/player-scoreboard-query";

import { MAX_ENTRIES } from "./PlayersPageOptions";

const PlayerStatsDistributionCharts = lazy(() =>
  import("~/components/features/players/PlayerStatsDistributionCharts").then((m) => ({
    default: m.PlayerStatsDistributionCharts,
  })),
);

export function PlayersPage() {
  const [tab, setTab] = useAnalyticsTab("players");
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
  const { startDate, endDate, handleDateChange, defaultRange } = useDateRangeState();
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
    <PageShell>
      <PageHeader align="start" title="Player Analytics" description="Player performance and stat distributions">
        <p>
          Compare top player performances and view percentile distributions across a range of performance metrics.
          Filter by hero, rank, and patch.
        </p>
      </PageHeader>

      <Tabs value={tab ?? undefined} onValueChange={(value) => setTab(value as typeof tab)} className="w-full">
        <ResponsiveTabsList
          aria-label="Player analytics sections"
          value={tab ?? undefined}
          onValueChange={(value) => setTab(value as typeof tab)}
        >
          <ResponsiveTab value="scoreboard">Scoreboard</ResponsiveTab>
          <ResponsiveTab value="stats-metrics">Stats Metrics</ResponsiveTab>
        </ResponsiveTabsList>

        <Filter.Root>
          <Filter.ModeWithRank
            value={{ mode, rank: [minRankId, maxRankId] }}
            onValueChange={(next) => {
              if (next.mode !== mode) setMode(next.mode);
              if (next.rank[0] !== minRankId || next.rank[1] !== maxRankId) {
                setMinRankId(next.rank[0]);
                setMaxRankId(next.rank[1]);
              }
            }}
          />
          <Filter.Hero value={heroId} onValueChange={setHeroId} allowNull />
          <Filter.SeasonPatchDate
            value={{ startDate, endDate }}
            onValueChange={(next) => handleDateChange(next.startDate, next.endDate, next.action)}
            defaultValue={{ startDate: defaultRange[0], endDate: defaultRange[1] }}
          />
          {tab === "scoreboard" && (
            <Filter.MinMatches value={minMatches} onValueChange={setMinMatches} min={1} defaultValue={0} />
          )}
        </Filter.Root>

        <TabsContent value="scoreboard">
          <Section titleDisplay="hidden" title="Player Scoreboard">
            <QueryRenderer
              query={scoreboardQuery}
              loadingFallback={<LoadingState label="player scoreboard" align="center" />}
              errorFallback={(error) => (
                <ErrorState
                  title="Failed to load scoreboard"
                  description={error.message}
                  onRetry={() => void scoreboardQuery.refetch()}
                  retrying={scoreboardQuery.isFetching}
                />
              )}
            >
              {(data) => (
                <ScoreboardTable
                  entries={data}
                  sortBy={sortBy}
                  sortDirection={sortDirection}
                  onSortChange={(next) => {
                    if (next.sortBy !== sortBy) setSortBy(next.sortBy);
                    if (next.sortDirection !== sortDirection) setSortDirection(next.sortDirection);
                  }}
                />
              )}
            </QueryRenderer>
          </Section>
        </TabsContent>

        <TabsContent value="stats-metrics">
          <Section titleDisplay="hidden" title="Player Stats Metrics">
            <ChunkErrorBoundary>
              <Suspense fallback={<LoadingState />}>
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
          </Section>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
