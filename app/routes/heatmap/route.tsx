import { useQueries } from "@tanstack/react-query";
import type { AnalyticsApiKillDeathStatsRequest } from "deadlock_api_client/api";
import { parseAsBoolean, parseAsInteger, parseAsStringLiteral, useQueryState } from "nuqs";
import { lazy, Suspense } from "react";

import { ChunkErrorBoundary } from "~/components/ChunkErrorBoundary";
import { Filter } from "~/components/Filter";
import { LoadingLogo } from "~/components/LoadingLogo";
import { combineQueryStates } from "~/components/QueryRenderer";
import { type GameMode, parseAsGameMode } from "~/components/selectors/GameModeSelector";
import type { Dayjs } from "~/dayjs";
import { PATCHES } from "~/lib/constants";
import { createPageMeta } from "~/lib/meta";
import { parseAsDayjsRange } from "~/lib/nuqs-parsers";
import { killDeathStatsQueryOptions, mapQueryOptions } from "~/queries/heatmap-queries";

import HeatmapCanvas from "./HeatmapCanvas";

const Heatmap3D = lazy(() => import("./Heatmap3D"));

const VIEW_MODES = ["kills", "deaths", "kd"] as const;

export function meta() {
  return createPageMeta({
    title: "Kill/Death Heatmap | Deadlock API",
    description: "Interactive kill heatmaps showing combat hotspots across Deadlock maps.",
    path: "/heatmap",
  });
}

export default function Heatmap() {
  const [viewMode, setViewMode] = useQueryState("view", parseAsStringLiteral(VIEW_MODES).withDefault("kills"));
  const [team, setTeam] = useQueryState("team", parseAsInteger.withDefault(0));
  const [is3D, setIs3D] = useQueryState("3d", parseAsBoolean.withDefault(false));
  const [heroId, setHeroId] = useQueryState("hero_id", parseAsInteger);
  const [gameMode, setGameMode] = useQueryState("game_mode", parseAsGameMode);
  const [minRankId, setMinRankId] = useQueryState("min_rank", parseAsInteger.withDefault(0));
  const [maxRankId, setMaxRankId] = useQueryState("max_rank", parseAsInteger.withDefault(116));
  const [minGameTime, setMinGameTime] = useQueryState("min_game_time", parseAsInteger.withDefault(0));
  const [maxGameTime, setMaxGameTime] = useQueryState("max_game_time", parseAsInteger.withDefault(3600));
  const [sensitivity, setOutlierSensitivity] = useQueryState("outlier", parseAsInteger.withDefault(9900));
  const [[startDate, endDate], setDateRange] = useQueryState(
    "date_range",
    parseAsDayjsRange.withDefault([PATCHES[0].startDate, PATCHES[0].endDate]),
  );

  const requestParams: AnalyticsApiKillDeathStatsRequest = {
    team: team,
    heroIds: heroId ? String(heroId) : undefined,
    gameMode: gameMode === "street_brawl" ? "street_brawl" : "normal",
    minAverageBadge: minRankId || undefined,
    maxAverageBadge: maxRankId < 116 ? maxRankId : undefined,
    minUnixTimestamp: startDate?.unix(),
    maxUnixTimestamp: endDate?.unix(),
    minGameTimeS: minGameTime || undefined,
    maxGameTimeS: maxGameTime < 3600 ? maxGameTime : undefined,
  };

  const [mapQuery, killDeathQuery] = useQueries({
    queries: [mapQueryOptions, killDeathStatsQueryOptions(requestParams)],
  });

  const { isPending, isError, error } = combineQueryStates(mapQuery, killDeathQuery);

  const handleDateChange = (start?: Dayjs, end?: Dayjs) => {
    setDateRange([start, end]);
  };

  const handleRankChange = (min: number, max: number) => {
    setMinRankId(min);
    setMaxRankId(max);
  };

  return (
    <div className="flex h-[calc(100dvh-2rem)] flex-col gap-4">
      <div className="shrink-0 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Kill/Death Heatmap</h1>
        <p className="mt-1 text-sm text-muted-foreground">Visualize kill and death hotspots across the map</p>
      </div>

      <Filter.Root>
        <Filter.Team value={team} onChange={setTeam} />
        <Filter.HeatmapViewMode value={viewMode} onChange={(m) => setViewMode(m as typeof viewMode)} />
        <Filter.DimensionToggle value={is3D} onChange={setIs3D} />
        <Filter.Hero value={heroId} onChange={setHeroId} allowNull label="Hero" />
        <Filter.GameModeWithRank
          gameMode={gameMode as GameMode}
          onGameModeChange={setGameMode}
          minRank={minRankId}
          maxRank={maxRankId}
          onRankChange={handleRankChange}
        />
        <Filter.PatchOrDate startDate={startDate} endDate={endDate} onDateChange={handleDateChange} />
        <Filter.TimeRange
          minTime={minGameTime || undefined}
          maxTime={maxGameTime < 3600 ? maxGameTime : undefined}
          onTimeChange={(min, max) => {
            setMinGameTime(min ?? 0);
            setMaxGameTime(max ?? 3600);
          }}
          label="Match Time"
          title="Kill/Death Time Window"
          description="Filter kills and deaths by when they occurred in the match."
        />
      </Filter.Root>

      <div className="flex max-h-[62.5vh] min-h-0 flex-1 items-center justify-center">
        {isPending ? (
          <LoadingLogo />
        ) : isError ? (
          <div className="text-center text-sm text-destructive">Failed to load heatmap data: {error?.message}</div>
        ) : mapQuery.data && killDeathQuery.data ? (
          is3D ? (
            <ChunkErrorBoundary>
              <Suspense fallback={<LoadingLogo />}>
                <Heatmap3D
                  data={killDeathQuery.data}
                  mapData={mapQuery.data}
                  viewMode={viewMode}
                  sensitivity={sensitivity / 10000}
                  onSensitivityChange={(v) => setOutlierSensitivity(Math.round(v * 10000))}
                />
              </Suspense>
            </ChunkErrorBoundary>
          ) : (
            <HeatmapCanvas
              data={killDeathQuery.data}
              mapData={mapQuery.data}
              viewMode={viewMode}
              sensitivity={sensitivity / 10000}
              onSensitivityChange={(v) => setOutlierSensitivity(Math.round(v * 10000))}
            />
          )
        ) : null}
      </div>
    </div>
  );
}
