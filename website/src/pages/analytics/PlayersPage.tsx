import { useQuery } from "@tanstack/react-query";
import type { PlayerScoreboardSortByEnum } from "deadlock_api_client";
import { Trophy } from "lucide-react";
import { parseAsInteger, parseAsStringLiteral, throttle, useQueryState } from "nuqs";
import { lazy, Suspense, useState } from "react";

import { Filter } from "~/components/domain/filters";
import { ScoreboardTable } from "~/components/domain/player-scoreboard/ScoreboardTable";
import { ALL_SORT_BY_VALUES } from "~/components/domain/player-scoreboard/sort-options";
import { SortBySelector } from "~/components/domain/player-scoreboard/SortBySelector";
import { ScoreboardCompareButton } from "~/components/features/player-compare/ScoreboardCompareButton";
import { FilterBar } from "~/components/patterns/filter-bar/FilterBar";
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
import { ANALYTICS_VIEWS } from "~/lib/analytics-tabs";
import { getEffectiveRankRange } from "~/lib/game-mode";
import { MAX_COMPARE_PLAYERS } from "~/lib/player-compare";
import { playerScoreboardQueryOptions } from "~/queries/player-scoreboard-query";

import { DEFAULT_MIN_MATCHES, MAX_ENTRIES } from "./PlayersPageOptions";

/** A filter or sort change and the page reset land in one throttled URL update, so one history entry. */
const together = { limitUrlUpdates: throttle(50) };

const PlayerComparison = lazy(() =>
  import("~/components/features/player-compare/PlayerComparison").then((m) => ({
    default: m.PlayerComparison,
  })),
);

const PlayerStatsDistributionCharts = lazy(() =>
  import("~/components/features/players/PlayerStatsDistributionCharts").then((m) => ({
    default: m.PlayerStatsDistributionCharts,
  })),
);

export function PlayersPage() {
  const [tab, setTab] = useAnalyticsTab("players");
  // Players picked on the scoreboard for a comparison; they stay picked across sorts and pages.
  const [picked, setPicked] = useState<number[]>([]);
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
  const [minMatches, setMinMatches] = useQueryState("min_matches", parseAsInteger.withDefault(DEFAULT_MIN_MATCHES));
  const [minRankId, setMinRankId] = useQueryState("min_rank", parseAsInteger.withDefault(0));
  const [maxRankId, setMaxRankId] = useQueryState("max_rank", parseAsInteger.withDefault(116));
  const { startDate, endDate, handleDateChange, defaultRange } = useDateRangeState();
  // Another board starts on its first page: a kept `page=5` opened a new sort at rank 101.
  const [, setPage] = useQueryState("page", parseAsInteger);
  const firstPage = () => void setPage(null, together);
  const { minUnixTimestamp, maxUnixTimestamp } = useNormalizedTimeRange(startDate, endDate);

  const { effectiveMinRankId, effectiveMaxRankId } = getEffectiveRankRange(mode, minRankId, maxRankId);

  const scoreboardQuery = useQuery({
    ...playerScoreboardQueryOptions({
      sortBy: sortBy as PlayerScoreboardSortByEnum,
      sortDirection: sortDirection,
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
    // Only the scoreboard tab draws these 1000 rows.
    enabled: tab === "scoreboard",
  });

  return (
    <PageShell>
      <PageHeader title={ANALYTICS_VIEWS.players[tab].heading} description={ANALYTICS_VIEWS.players[tab].summary}>
        <p>
          Compare top player performances and view percentile distributions across a range of performance metrics.
          Filter by hero, rank, and patch.
        </p>
      </PageHeader>

      <Filter.Root>
        <Filter.ModeWithRank
          // A comparison is of the players' own matches, whatever lobby they were in: no rank filter there.
          hideRankRange={tab === "compare"}
          value={{ mode, rank: [minRankId, maxRankId] }}
          onValueChange={(next) => {
            if (next.mode !== mode) setMode(next.mode);
            if (next.rank[0] !== minRankId || next.rank[1] !== maxRankId) {
              void setMinRankId(next.rank[0]);
              void setMaxRankId(next.rank[1]);
            }
            firstPage();
          }}
        />
        <Filter.Hero
          value={heroId}
          onValueChange={(id) => {
            void setHeroId(id, together);
            firstPage();
          }}
          allowNull
        />
        <Filter.SeasonPatchDate
          value={{ startDate, endDate }}
          onValueChange={(next) => {
            handleDateChange(next.startDate, next.endDate, next.action);
            firstPage();
          }}
          defaultValue={{ startDate: defaultRange[0], endDate: defaultRange[1] }}
        />
        {tab === "scoreboard" && (
          <Filter.MinMatches
            value={minMatches}
            onValueChange={(n) => {
              void setMinMatches(n, together);
              firstPage();
            }}
            min={0}
            defaultValue={DEFAULT_MIN_MATCHES}
          />
        )}
      </Filter.Root>

      <Tabs value={tab ?? undefined} onValueChange={(value) => setTab(value as typeof tab)} className="w-full">
        <ResponsiveTabsList
          aria-label="Player analytics sections"
          value={tab ?? undefined}
          onValueChange={(value) => setTab(value as typeof tab)}
        >
          <ResponsiveTab value="scoreboard">Scoreboard</ResponsiveTab>
          <ResponsiveTab value="stats-metrics">Stats Metrics</ResponsiveTab>
          <ResponsiveTab value="compare">Compare</ResponsiveTab>
        </ResponsiveTabsList>

        <TabsContent value="scoreboard">
          <Section titleDisplay="hidden" title="Player Scoreboard">
            <FilterBar variant="toolbar" title="Player scoreboard" icon={Trophy} aria-label="Scoreboard controls">
              <SortBySelector
                size="sm"
                value={sortBy}
                defaultValue="kills"
                onValueChange={(next) => {
                  void setSortBy(next, together);
                  firstPage();
                }}
              />
            </FilterBar>
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
                  selectedAccountIds={picked}
                  onValueChange={setPicked}
                  maxSelected={MAX_COMPARE_PLAYERS}
                  pickHeader={<ScoreboardCompareButton accountIds={picked} />}
                  sortBy={sortBy}
                  sortDirection={sortDirection}
                  onSortChange={(next) => {
                    if (next.sortBy !== sortBy) void setSortBy(next.sortBy, together);
                    if (next.sortDirection !== sortDirection) void setSortDirection(next.sortDirection, together);
                    firstPage();
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

        <TabsContent value="compare">
          <Section titleDisplay="hidden" title="Compare Players">
            <ChunkErrorBoundary>
              <Suspense fallback={<LoadingState />}>
                <PlayerComparison
                  filters={{
                    gameMode,
                    matchMode,
                    heroId,
                    minUnixTimestamp: minUnixTimestamp ?? 0,
                    maxUnixTimestamp,
                  }}
                />
              </Suspense>
            </ChunkErrorBoundary>
          </Section>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
