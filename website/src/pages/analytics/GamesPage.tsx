import type { AnalyticsApiGameStatsRequest, GameStatsBucketEnum } from "deadlock_api_client";
import { parseAsInteger, parseAsStringLiteral, useQueryState } from "nuqs";
import { lazy, Suspense } from "react";

import { Filter } from "~/components/domain/filters";
import GamesOverview from "~/components/features/games/GamesOverview";
import { ALL_STAT_KEYS } from "~/components/features/games/stat-definitions";
import { ResponsiveTab, ResponsiveTabsList } from "~/components/patterns/navigation/ResponsiveTabsList";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { ChunkErrorBoundary } from "~/components/patterns/states/ChunkErrorBoundary";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Tabs, TabsContent } from "~/components/ui/tabs";
import { useAnalyticsTab } from "~/hooks/useAnalyticsTab";
import { useDateRangeState } from "~/hooks/useDateRangeState";
import { useModeState } from "~/hooks/useModeState";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { getEffectiveRankRange } from "~/lib/game-mode";

const GamesOverTimeChart = lazy(() => import("~/components/features/games/GamesOverTimeChart"));
const GamesByRankChart = lazy(() => import("~/components/features/games/GamesByRankChart"));
const EconomyTab = lazy(() => import("~/components/features/games/EconomyTab"));

export function Games() {
  const [tab, setTab] = useAnalyticsTab("games");
  const { mode, setMode, gameMode, matchMode } = useModeState();
  const isStreetBrawl = mode === "street_brawl";
  const [minRankId, setMinRankId] = useQueryState("min_rank", parseAsInteger.withDefault(0));
  const [maxRankId, setMaxRankId] = useQueryState("max_rank", parseAsInteger.withDefault(116));
  const { startDate, endDate, prevStartDate, prevEndDate, handleDateChange, defaultRange } = useDateRangeState();
  const [minDurationS, setMinDurationS] = useQueryState("min_duration_s", parseAsInteger);
  const [maxDurationS, setMaxDurationS] = useQueryState("max_duration_s", parseAsInteger);
  const [stat, setStat] = useQueryState(
    "stat",
    parseAsStringLiteral(ALL_STAT_KEYS as unknown as readonly string[]).withDefault("avg_kills"),
  );
  const [timeBucket, setTimeBucket] = useQueryState(
    "time_bucket",
    parseAsStringLiteral(["start_time_day", "start_time_week", "start_time_month"] as const).withDefault(
      "start_time_day",
    ),
  );

  const { effectiveMinRankId, effectiveMaxRankId } = getEffectiveRankRange(mode, minRankId, maxRankId);
  const { minUnixTimestamp, maxUnixTimestamp } = useNormalizedTimeRange(startDate, endDate);
  const { minUnixTimestamp: prevMinUnix, maxUnixTimestamp: prevMaxUnix } = useNormalizedTimeRange(
    prevStartDate,
    prevEndDate,
  );

  const baseParams: AnalyticsApiGameStatsRequest = {
    gameMode,
    matchMode,
    minUnixTimestamp: minUnixTimestamp ?? 0,
    maxUnixTimestamp,
    minDurationS: minDurationS ?? undefined,
    maxDurationS: maxDurationS ?? undefined,
    minAverageBadge: effectiveMinRankId,
    maxAverageBadge: effectiveMaxRankId,
  };

  const prevParams: AnalyticsApiGameStatsRequest | null =
    prevStartDate && prevEndDate && prevMinUnix != null && prevMaxUnix != null
      ? {
          ...baseParams,
          minUnixTimestamp: prevMinUnix,
          maxUnixTimestamp: prevMaxUnix,
        }
      : null;

  return (
    <PageShell>
      <PageHeader title="Deadlock Game Stats" description="Aggregate match statistics and trends">
        <p>
          Track Deadlock match trends including average kills, deaths, game duration, and more. View stats over time,
          compare across ranks, and spot meta shifts as patches roll out.
        </p>
      </PageHeader>

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
        <Filter.SeasonPatchDate
          value={{ startDate, endDate }}
          onValueChange={(next) => handleDateChange(next.startDate, next.endDate, next.action)}
          resetRange={defaultRange}
        />
        <Filter.MatchDuration
          value={[minDurationS ?? undefined, maxDurationS ?? undefined]}
          onValueChange={([min, max]) => {
            setMinDurationS(min ?? null);
            setMaxDurationS(max ?? null);
          }}
        />
      </Filter.Root>

      <Tabs value={tab ?? undefined} onValueChange={(value) => setTab(value as typeof tab)} className="w-full">
        <ResponsiveTabsList
          aria-label="Game stats sections"
          value={tab ?? undefined}
          onValueChange={(value) => setTab(value as typeof tab)}
        >
          <ResponsiveTab value="overview">Overview</ResponsiveTab>
          <ResponsiveTab value="over-time">Over Time</ResponsiveTab>
          <ResponsiveTab value="by-rank">By Rank</ResponsiveTab>
          <ResponsiveTab value="economy">Economy</ResponsiveTab>
        </ResponsiveTabsList>

        <TabsContent value="overview">
          <ChunkErrorBoundary>
            <Suspense fallback={<LoadingState />}>
              <GamesOverview
                params={baseParams}
                prevParams={prevParams}
                isStreetBrawl={isStreetBrawl}
                onStatClick={async (key) => {
                  await setStat(key);
                  await setTab("over-time");
                }}
              />
            </Suspense>
          </ChunkErrorBoundary>
        </TabsContent>

        <TabsContent value="over-time">
          <ChunkErrorBoundary>
            <Suspense fallback={<LoadingState />}>
              <GamesOverTimeChart
                params={baseParams}
                stat={stat}
                onStatChange={setStat}
                timeBucket={timeBucket as GameStatsBucketEnum}
                onTimeBucketChange={(b) => setTimeBucket(b as typeof timeBucket)}
                isStreetBrawl={isStreetBrawl}
              />
            </Suspense>
          </ChunkErrorBoundary>
        </TabsContent>

        <TabsContent value="by-rank">
          <ChunkErrorBoundary>
            <Suspense fallback={<LoadingState />}>
              <GamesByRankChart params={baseParams} stat={stat} onStatChange={setStat} isStreetBrawl={isStreetBrawl} />
            </Suspense>
          </ChunkErrorBoundary>
        </TabsContent>

        <TabsContent value="economy">
          <ChunkErrorBoundary>
            <Suspense fallback={<LoadingState />}>
              <EconomyTab params={baseParams} isStreetBrawl={isStreetBrawl} />
            </Suspense>
          </ChunkErrorBoundary>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
