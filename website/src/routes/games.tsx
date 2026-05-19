import { createFileRoute } from "@tanstack/react-router";
import type { AnalyticsApiGameStatsRequest, GameStatsBucketEnum } from "deadlock_api_client";
import { parseAsInteger, parseAsStringLiteral, useQueryState } from "nuqs";
import { lazy, Suspense, useState } from "react";

import { ChunkErrorBoundary } from "~/components/ChunkErrorBoundary";
import { Filter } from "~/components/Filter";
import GamesOverview from "~/components/games-page/GamesOverview";
import { ALL_STAT_KEYS } from "~/components/games-page/stat-definitions";
import { LoadingLogo } from "~/components/LoadingLogo";
import { computePreviousPeriod } from "~/components/PatchOrDatePicker";
import { ResponsiveTabsList } from "~/components/ResponsiveTabsList";
import { parseAsGameMode } from "~/components/selectors/GameModeSelector";
import { Tabs, TabsContent } from "~/components/ui/tabs";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { DEFAULT_DATE_RANGE, PATCHES } from "~/lib/constants";
import { isStreetBrawlMode } from "~/lib/game-mode";
import { parseAsDayjsRange } from "~/lib/nuqs-parsers";
import { seo } from "~/lib/seo";
import { normalizeUnixCeil, normalizeUnixFloor } from "~/lib/time-normalize";
import { gameStatsQueryOptions } from "~/queries/games-query";

const GamesOverTimeChart = lazy(() => import("~/components/games-page/GamesOverTimeChart"));
const GamesByRankChart = lazy(() => import("~/components/games-page/GamesByRankChart"));

export const Route = createFileRoute("/games")({
  component: Games,
  loader: async ({ context: { queryClient } }) => {
    const minUnixTimestamp = normalizeUnixFloor(DEFAULT_DATE_RANGE[0]) ?? 0;
    const maxUnixTimestamp = normalizeUnixCeil(DEFAULT_DATE_RANGE[1]);
    const { prevStartDate, prevEndDate } = computePreviousPeriod(DEFAULT_DATE_RANGE[0], DEFAULT_DATE_RANGE[1], PATCHES);
    const baseParams: AnalyticsApiGameStatsRequest = {
      gameMode: "normal",
      minUnixTimestamp,
      maxUnixTimestamp,
      minAverageBadge: 0,
      maxAverageBadge: 116,
    };
    await Promise.all([
      queryClient.ensureQueryData(gameStatsQueryOptions({ ...baseParams, bucket: "no_bucket" })),
      queryClient.ensureQueryData(
        gameStatsQueryOptions({
          ...baseParams,
          minUnixTimestamp: normalizeUnixFloor(prevStartDate) ?? 0,
          maxUnixTimestamp: normalizeUnixCeil(prevEndDate),
          bucket: "no_bucket",
        }),
      ),
    ]);
  },
  head: () =>
    seo({
      title: "Deadlock Game Stats: Match Trends, Avg Kills & Souls by Rank",
      description: "Aggregate game statistics and match analytics for Deadlock by Valve.",
      path: "/games",
    }),
});

function Games() {
  const [tab, setTab] = useQueryState(
    "tab",
    parseAsStringLiteral(["overview", "over-time", "by-rank"] as const).withDefault("overview"),
  );
  const [gameMode, setGameMode] = useQueryState("game_mode", parseAsGameMode);
  const [minRankId, setMinRankId] = useQueryState("min_rank", parseAsInteger.withDefault(0));
  const [maxRankId, setMaxRankId] = useQueryState("max_rank", parseAsInteger.withDefault(116));
  const [[startDate, endDate], setDateRange] = useQueryState(
    "date_range",
    parseAsDayjsRange.withDefault(DEFAULT_DATE_RANGE),
  );
  const [prevDates, setPrevDates] = useState(() =>
    computePreviousPeriod(DEFAULT_DATE_RANGE[0], DEFAULT_DATE_RANGE[1], PATCHES),
  );
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

  const isStreetBrawl = isStreetBrawlMode(gameMode);

  const { minUnixTimestamp, maxUnixTimestamp } = useNormalizedTimeRange(startDate, endDate);
  const { minUnixTimestamp: prevMinUnix, maxUnixTimestamp: prevMaxUnix } = useNormalizedTimeRange(
    prevDates.prevStartDate,
    prevDates.prevEndDate,
  );

  const baseParams: AnalyticsApiGameStatsRequest = {
    gameMode: gameMode ?? undefined,
    minUnixTimestamp: minUnixTimestamp ?? 0,
    maxUnixTimestamp,
    minDurationS: minDurationS ?? undefined,
    maxDurationS: maxDurationS ?? undefined,
    minAverageBadge: isStreetBrawl ? undefined : minRankId,
    maxAverageBadge: isStreetBrawl ? undefined : maxRankId,
  };

  const prevParams: AnalyticsApiGameStatsRequest | null =
    prevDates.prevStartDate && prevDates.prevEndDate && prevMinUnix != null && prevMaxUnix != null
      ? {
          ...baseParams,
          minUnixTimestamp: prevMinUnix,
          maxUnixTimestamp: prevMaxUnix,
        }
      : null;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Game Stats</h1>
        <p className="mt-1 text-sm text-muted-foreground">Aggregate match statistics and trends</p>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Track Deadlock match trends including average kills, deaths, game duration, and more. View stats over time,
          compare across ranks, and spot meta shifts as patches roll out.
        </p>
      </div>

      <Filter.Root>
        <Filter.GameModeWithRank
          gameMode={gameMode}
          onGameModeChange={setGameMode}
          minRank={minRankId}
          maxRank={maxRankId}
          onRankChange={(min, max) => {
            setMinRankId(min);
            setMaxRankId(max);
          }}
        />
        <Filter.PatchOrDate
          startDate={startDate}
          endDate={endDate}
          onDateChange={(s, e, ps, pe) => {
            setDateRange([s, e]);
            setPrevDates({ prevStartDate: ps, prevEndDate: pe });
          }}
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
          value={tab ?? undefined}
          onValueChange={(value) => setTab(value as typeof tab)}
          options={[
            { value: "overview", label: "Overview" },
            { value: "over-time", label: "Over Time" },
            { value: "by-rank", label: "By Rank" },
          ]}
        />

        <TabsContent value="overview">
          <ChunkErrorBoundary>
            <Suspense fallback={<LoadingLogo />}>
              <GamesOverview
                params={baseParams}
                prevParams={prevParams}
                isStreetBrawl={isStreetBrawl}
                onStatClick={(key) => {
                  setStat(key);
                  setTab("over-time");
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
      </Tabs>
    </div>
  );
}
