import { useQueries } from "@tanstack/react-query";
import type { AnalyticsApiKillDeathStatsRequest } from "deadlock_api_client/api";
import { parseAsBoolean, parseAsInteger, parseAsStringLiteral, useQueryState } from "nuqs";
import { lazy, Suspense } from "react";
import { Filter } from "~/components/Filter";
import { LoadingLogo } from "~/components/LoadingLogo";
import { type GameMode, parseAsGameMode } from "~/components/selectors/GameModeSelector";
import type { Dayjs } from "~/dayjs";
import { api } from "~/lib/api";
import { assetsApi } from "~/lib/assets-api";
import { PATCHES } from "~/lib/constants";
import { parseAsDayjsRange } from "~/lib/nuqs-parsers";
import { queryKeys } from "~/queries/query-keys";
import HeatmapCanvas from "./HeatmapCanvas";

const Heatmap3D = lazy(() => import("./Heatmap3D"));

const VIEW_MODES = ["kills", "deaths", "kd"] as const;
type ViewMode = (typeof VIEW_MODES)[number];

import { createPageMeta } from "~/lib/meta";

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
    queries: [
      {
        queryKey: queryKeys.map(),
        queryFn: async () => {
          const response = await assetsApi.default_api.getMapV1MapGet();
          return response.data;
        },
        staleTime: Number.MAX_SAFE_INTEGER,
      },
      {
        queryKey: queryKeys.analytics.killDeathStats(requestParams),
        queryFn: async () => {
          const response = await api.analytics_api.killDeathStats(requestParams);
          return response.data;
        },
        staleTime: 24 * 60 * 60 * 1000,
      },
    ],
  });

  const isPending = mapQuery.isPending || killDeathQuery.isPending;
  const isError = mapQuery.isError || killDeathQuery.isError;
  const error = mapQuery.error || killDeathQuery.error;

  const handleDateChange = (start?: Dayjs, end?: Dayjs) => {
    setDateRange([start, end]);
  };

  const handleRankChange = (min: number, max: number) => {
    setMinRankId(min);
    setMaxRankId(max);
  };

  return (
    <div className="flex flex-col gap-4 h-[calc(100dvh-2rem)]">
      <div className="text-center shrink-0">
        <h1 className="text-3xl font-bold tracking-tight">Kill/Death Heatmap</h1>
        <p className="text-sm text-muted-foreground mt-1">Visualize kill and death hotspots across the map</p>
      </div>

      <Filter.Root>
        <Filter.Team value={team} onChange={setTeam} />
        <ViewModeToggle value={viewMode} onChange={setViewMode} />
        <DimensionToggle value={is3D} onChange={setIs3D} />
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

      <div className="flex-1 min-h-0 flex justify-center items-center max-h-[62.5vh]">
        {isPending ? (
          <LoadingLogo />
        ) : isError ? (
          <div className="text-center text-sm text-destructive">Failed to load heatmap data: {error?.message}</div>
        ) : mapQuery.data && killDeathQuery.data ? (
          is3D ? (
            <Suspense fallback={<LoadingLogo />}>
              <Heatmap3D
                data={killDeathQuery.data}
                mapData={mapQuery.data}
                viewMode={viewMode}
                sensitivity={sensitivity / 10000}
                onSensitivityChange={(v) => setOutlierSensitivity(Math.round(v * 10000))}
              />
            </Suspense>
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

function ViewModeToggle({ value, onChange }: { value: ViewMode; onChange: (mode: ViewMode) => void }) {
  return (
    <div className="inline-flex items-center rounded-full border border-white/[0.08] bg-secondary p-0.5">
      {VIEW_MODES.map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          className={`px-3 py-1 text-sm rounded-full transition-all cursor-pointer ${
            value === mode
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {mode === "kills" ? "Kills" : mode === "deaths" ? "Deaths" : "K/D"}
        </button>
      ))}
    </div>
  );
}

function DimensionToggle({ value, onChange }: { value: boolean; onChange: (is3D: boolean) => void }) {
  return (
    <div className="inline-flex items-center rounded-full border border-white/[0.08] bg-secondary p-0.5">
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`px-3 py-1 text-sm rounded-full transition-all cursor-pointer ${
          !value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        2D
      </button>
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`px-3 py-1 text-sm rounded-full transition-all cursor-pointer ${
          value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        3D
      </button>
    </div>
  );
}
