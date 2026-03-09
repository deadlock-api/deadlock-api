import { parseAsInteger, parseAsStringLiteral, useQueryState } from "nuqs";
import { useState } from "react";
import type { MetaFunction } from "react-router";
import { Filter } from "~/components/Filter";
import { computePreviousPeriod } from "~/components/PatchOrDatePicker";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { parseAsGameMode } from "~/components/selectors/GameModeSelector";
import type { GameStatsBucketEnum } from "deadlock_api_client";
import type { GameStatsQueryParams } from "~/queries/game-stats-query";
import { PATCHES } from "~/lib/constants";
import { parseAsDayjsRange } from "~/lib/nuqs-parsers";
import GameStatsByRankChart from "./GameStatsByRankChart";
import GameStatsOverTimeChart from "./GameStatsOverTimeChart";
import GameStatsOverview from "./GameStatsOverview";
import { ALL_STAT_KEYS } from "./stat-definitions";

export const meta: MetaFunction = () => {
  return [
    { title: "Game Stats & Match Trends | Deadlock API" },
    {
      name: "description",
      content: "Aggregate match statistics, trends over time, and stats by rank for Deadlock.",
    },
  ];
};

export default function GameStats() {
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
        <TabsList variant="line" className="w-full overflow-x-auto scrollbar-none">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="over-time">Over Time</TabsTrigger>
          <TabsTrigger value="by-rank">By Rank</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <GameStatsOverview
            params={baseParams}
            prevParams={prevParams}
            isStreetBrawl={isStreetBrawl}
            onStatClick={(key) => {
              setStat(key);
              setTab("over-time");
            }}
          />
        </TabsContent>

        <TabsContent value="over-time">
          <GameStatsOverTimeChart
            params={baseParams}
            stat={stat}
            onStatChange={setStat}
            timeBucket={timeBucket as GameStatsBucketEnum}
            onTimeBucketChange={(b) => setTimeBucket(b as typeof timeBucket)}
            isStreetBrawl={isStreetBrawl}
          />
        </TabsContent>

        <TabsContent value="by-rank">
          <GameStatsByRankChart params={baseParams} stat={stat} onStatChange={setStat} isStreetBrawl={isStreetBrawl} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
