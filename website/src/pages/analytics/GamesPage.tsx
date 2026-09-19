import type { AnalyticsApiGameStatsRequest, GameStatsBucketEnum } from "deadlock_api_client";
import { parseAsInteger, parseAsStringLiteral, useQueryState } from "nuqs";
import { lazy, Suspense } from "react";

import { DataPageHeader } from "~/components/analytics/DataPageHeader";
import { ChunkErrorBoundary } from "~/components/ChunkErrorBoundary";
import { Filter } from "~/components/Filter";
import GamesOverview from "~/components/games-page/GamesOverview";
import { ALL_STAT_KEYS } from "~/components/games-page/stat-definitions";
import { LoadingLogo } from "~/components/LoadingLogo";
import { ResponsiveTabsList } from "~/components/ResponsiveTabsList";
import { Tabs, TabsContent } from "~/components/ui/tabs";
import { useAnalyticsTab } from "~/hooks/useAnalyticsTab";
import { useDateRangeState } from "~/hooks/useDateRangeState";
import { useModeState } from "~/hooks/useModeState";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { getEffectiveRankRange } from "~/lib/game-mode";

const GamesOverTimeChart = lazy(() => import("~/components/games-page/GamesOverTimeChart"));
const GamesByRankChart = lazy(() => import("~/components/games-page/GamesByRankChart"));
const EconomyTab = lazy(() => import("~/components/games-page/EconomyTab"));

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
    <div className="flex flex-col gap-3">
      <DataPageHeader title="Deadlock Game Stats" description="Aggregate match statistics and trends">
        <p>
          Track Deadlock match trends including average kills, deaths, game duration, and more. View stats over time,
          compare across ranks, and spot meta shifts as patches roll out.
        </p>
      </DataPageHeader>

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
        <Filter.SeasonPatchDate
          startDate={startDate}
          endDate={endDate}
          onDateChange={handleDateChange}
          resetRange={defaultRange}
        />
        <Filter.MatchDuration
          minTime={minDurationS ?? undefined}
          maxTime={maxDurationS ?? undefined}
          onTimeChange={(min, max) => {
            setMinDurationS(min ?? null);
            setMaxDurationS(max ?? null);
          }}
        />
      </Filter.Root>

      <Tabs value={tab ?? undefined} onValueChange={(value) => setTab(value as typeof tab)} className="tabs-nav w-full">
        <ResponsiveTabsList
          ariaLabel="Game stats sections"
          value={tab ?? undefined}
          onValueChange={(value) => setTab(value as typeof tab)}
          options={[
            { value: "overview", label: "Overview" },
            { value: "over-time", label: "Over Time" },
            { value: "by-rank", label: "By Rank" },
            { value: "economy", label: "Economy" },
          ]}
        />

        <TabsContent value="overview">
          <ChunkErrorBoundary>
            <Suspense fallback={<LoadingLogo />}>
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
            <Suspense fallback={<LoadingLogo />}>
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
            <Suspense fallback={<LoadingLogo />}>
              <GamesByRankChart params={baseParams} stat={stat} onStatChange={setStat} isStreetBrawl={isStreetBrawl} />
            </Suspense>
          </ChunkErrorBoundary>
        </TabsContent>

        <TabsContent value="economy">
          <ChunkErrorBoundary>
            <Suspense fallback={<LoadingLogo />}>
              <EconomyTab params={baseParams} isStreetBrawl={isStreetBrawl} />
            </Suspense>
          </ChunkErrorBoundary>
        </TabsContent>
      </Tabs>
    </div>
  );
}
