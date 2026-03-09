import { parseAsInteger, parseAsStringLiteral, useQueryState } from "nuqs";
import { Suspense, lazy, useState } from "react";
import type { MetaFunction } from "react-router";
import { Filter } from "~/components/Filter";
import { LoadingLogo } from "~/components/LoadingLogo";
import { computePreviousPeriod } from "~/components/PatchOrDatePicker";
import { parseAsGameMode } from "~/components/selectors/GameModeSelector";
import { ResponsiveTabsList } from "~/components/ResponsiveTabsList";
import { Tabs, TabsContent } from "~/components/ui/tabs";
import type { GameStatsBucketEnum } from "deadlock_api_client";
import { PATCHES } from "~/lib/constants";
import { createPageMeta } from "~/lib/meta";
import { parseAsDayjsRange } from "~/lib/nuqs-parsers";
import type { GameStatsQueryParams } from "~/queries/games-query";
import { ALL_STAT_KEYS } from "./stat-definitions";

const GamesOverview = lazy(() => import("./GamesOverview"));
const GamesOverTimeChart = lazy(() => import("./GamesOverTimeChart"));
const GamesByRankChart = lazy(() => import("./GamesByRankChart"));

export const meta: MetaFunction = () => {
  return createPageMeta({
    title: "Game Stats & Match Trends | Deadlock API",
    description: "Aggregate game statistics and match analytics for Deadlock by Valve.",
    path: "/games",
  });
};

export default function Games() {
  const [tab, setTab] = useQueryState(
    "tab",
    parseAsStringLiteral(["overview", "over-time", "by-rank"] as const).withDefault("overview"),
  );
  const [gameMode, setGameMode] = useQueryState("game_mode", parseAsGameMode);
  const [minRankId, setMinRankId] = useQueryState("min_rank", parseAsInteger.withDefault(0));
  const [maxRankId, setMaxRankId] = useQueryState("max_rank", parseAsInteger.withDefault(116));
  const [[startDate, endDate], setDateRange] = useQueryState(
    "date_range",
    parseAsDayjsRange.withDefault([PATCHES[0].startDate, PATCHES[0].endDate]),
  );
  const [prevDates, setPrevDates] = useState(() =>
    computePreviousPeriod(PATCHES[0].startDate, PATCHES[0].endDate, PATCHES),
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

  const isStreetBrawl = gameMode === "street_brawl";

  const baseParams: GameStatsQueryParams = {
    gameMode: gameMode ?? undefined,
    minUnixTimestamp: startDate ? startDate.unix() : 0,
    maxUnixTimestamp: endDate ? endDate.unix() : undefined,
    minDurationS: minDurationS ?? undefined,
    maxDurationS: maxDurationS ?? undefined,
    minAverageBadge: isStreetBrawl ? undefined : minRankId,
    maxAverageBadge: isStreetBrawl ? undefined : maxRankId,
  };

  const prevParams: GameStatsQueryParams | null =
    prevDates.prevStartDate && prevDates.prevEndDate
      ? {
          ...baseParams,
          minUnixTimestamp: prevDates.prevStartDate.unix(),
          maxUnixTimestamp: prevDates.prevEndDate.unix(),
        }
      : null;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Game Stats</h1>
        <p className="text-sm text-muted-foreground mt-1">Aggregate match statistics and trends</p>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl mx-auto leading-relaxed">
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
        </TabsContent>

        <TabsContent value="over-time">
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
        </TabsContent>

        <TabsContent value="by-rank">
          <Suspense fallback={<LoadingLogo />}>
            <GamesByRankChart params={baseParams} stat={stat} onStatChange={setStat} isStreetBrawl={isStreetBrawl} />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
