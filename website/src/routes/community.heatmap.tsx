import { useQueries } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { AnalyticsApiKillDeathStatsRequest } from "deadlock_api_client";
import { parseAsBoolean, parseAsInteger, parseAsStringLiteral, useQueryState } from "nuqs";
import { lazy, Suspense } from "react";

import { Filter } from "~/components/domain/filters";
import type { ModeWithRank } from "~/components/domain/filters/ModeWithRankFilter";
import HeatmapCanvas from "~/components/features/heatmap/HeatmapCanvas";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { ChunkErrorBoundary } from "~/components/patterns/states/ChunkErrorBoundary";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { combineQueryStates } from "~/components/patterns/states/QueryRenderer";
import { useDateRangeState } from "~/hooks/useDateRangeState";
import { useModeState } from "~/hooks/useModeState";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { getEffectiveRankRange } from "~/lib/game-mode";
import { prefetchSafe } from "~/lib/prefetch-safe";
import { seo } from "~/lib/seo";
import { loadSeasons } from "~/queries/asset-queries";
import { killDeathStatsQueryOptions, mapQueryOptions } from "~/queries/heatmap-queries";

const Heatmap3D = lazy(() => import("~/components/features/heatmap/Heatmap3D"));

const VIEW_MODES = ["kills", "deaths", "kd"] as const;

export const Route = createFileRoute("/community/heatmap")({
  component: HeatmapPage,
  // Kill/death stats are ~2 MB and only feed a client-side canvas, so they are
  // fetched after hydration instead of being dehydrated into the HTML.
  loader: async ({ context: { queryClient } }) => {
    await Promise.all([prefetchSafe(queryClient.ensureQueryData(mapQueryOptions)), loadSeasons(queryClient)]);
  },
  head: () =>
    seo({
      title: "Deadlock Map Heatmaps: Player Position & Kill Density",
      description:
        "Interactive Deadlock map heatmaps showing player positions, kill density, and zone control across ranked matches.",
      path: "/community/heatmap",
    }),
});

function HeatmapPage() {
  const [viewMode, setViewMode] = useQueryState("view", parseAsStringLiteral(VIEW_MODES).withDefault("kills"));
  const [team, setTeam] = useQueryState("team", parseAsInteger.withDefault(0));
  const [is3D, setIs3D] = useQueryState("3d", parseAsBoolean.withDefault(false));
  const [heroId, setHeroId] = useQueryState("hero_id", parseAsInteger);
  const { mode, setMode, gameMode, matchMode } = useModeState();
  const [minRankId, setMinRankId] = useQueryState("min_rank", parseAsInteger.withDefault(0));
  const [maxRankId, setMaxRankId] = useQueryState("max_rank", parseAsInteger.withDefault(116));
  const [minGameTime, setMinGameTime] = useQueryState("min_game_time", parseAsInteger.withDefault(0));
  const [maxGameTime, setMaxGameTime] = useQueryState("max_game_time", parseAsInteger.withDefault(3600));
  const [sensitivity, setOutlierSensitivity] = useQueryState("outlier", parseAsInteger.withDefault(9900));
  const { startDate, endDate, handleDateChange, defaultRange } = useDateRangeState();

  const { effectiveMinRankId, effectiveMaxRankId } = getEffectiveRankRange(mode, minRankId, maxRankId);
  const { minUnixTimestamp, maxUnixTimestamp } = useNormalizedTimeRange(startDate, endDate);

  const requestParams: AnalyticsApiKillDeathStatsRequest = {
    team: team,
    heroIds: heroId ? String(heroId) : undefined,
    gameMode,
    matchMode,
    minAverageBadge: effectiveMinRankId || undefined,
    maxAverageBadge: effectiveMaxRankId != null && effectiveMaxRankId < 116 ? effectiveMaxRankId : undefined,
    minUnixTimestamp: minUnixTimestamp ?? 0,
    maxUnixTimestamp,
    minGameTimeS: minGameTime || undefined,
    maxGameTimeS: maxGameTime < 3600 ? maxGameTime : undefined,
  };

  const [mapQuery, killDeathQuery] = useQueries({
    queries: [mapQueryOptions, killDeathStatsQueryOptions(requestParams)],
  });

  const { isPending, isError, error } = combineQueryStates(mapQuery, killDeathQuery);

  const handleModeWithRankChange = ({ mode: nextMode, rank: [min, max] }: ModeWithRank) => {
    setMode(nextMode);
    setMinRankId(min);
    setMaxRankId(max);
  };

  return (
    <PageShell height="viewport">
      <PageHeader title="Kill/Death Heatmap" description="Visualize kill and death hotspots across the map" />

      <Filter.Root>
        <Filter.Team value={team} onValueChange={setTeam} />
        <Filter.HeatmapViewMode value={viewMode} onValueChange={setViewMode} />
        <Filter.DimensionToggle value={is3D} onValueChange={setIs3D} />
        <Filter.Hero value={heroId} onValueChange={setHeroId} allowNull label="Hero" />
        <Filter.ModeWithRank value={{ mode, rank: [minRankId, maxRankId] }} onValueChange={handleModeWithRankChange} />
        <Filter.SeasonPatchDate
          value={{ startDate, endDate }}
          onValueChange={({ startDate: start, endDate: end, action }) => handleDateChange(start, end, action)}
          resetRange={defaultRange}
        />
        <Filter.TimeRange
          value={[minGameTime || undefined, maxGameTime < 3600 ? maxGameTime : undefined]}
          onValueChange={([min, max]) => {
            setMinGameTime(min ?? 0);
            setMaxGameTime(max ?? 3600);
          }}
          label="Match Time"
          title="Kill/Death Time Window"
        />
      </Filter.Root>

      <div className="flex min-h-0 flex-1 items-center justify-center">
        {isPending ? (
          <LoadingState label="heatmap" />
        ) : isError ? (
          <ErrorState
            title="Failed to load heatmap data"
            description={error?.message}
            retrying={mapQuery.isFetching || killDeathQuery.isFetching}
            onRetry={() => {
              if (mapQuery.isError) void mapQuery.refetch();
              if (killDeathQuery.isError) void killDeathQuery.refetch();
            }}
          />
        ) : mapQuery.data && killDeathQuery.data ? (
          is3D ? (
            <ChunkErrorBoundary>
              <Suspense fallback={<LoadingState label="3D heatmap" />}>
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
    </PageShell>
  );
}
