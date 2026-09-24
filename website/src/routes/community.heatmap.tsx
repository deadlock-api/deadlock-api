import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { AnalyticsApiKillDeathStatsRequest } from "deadlock_api_client";
import { parseAsBoolean, parseAsInteger, parseAsStringLiteral, useQueryState } from "nuqs";
import { lazy, Suspense } from "react";

import { Filter } from "~/components/domain/filters";
import type { ModeWithRank } from "~/components/domain/filters/ModeWithRankFilter";
import HeatmapCanvas from "~/components/features/heatmap/HeatmapCanvas";
import { FilterToggleCell } from "~/components/patterns/filter-bar/FilterCell";
import { StringOption, StringSelector } from "~/components/patterns/filter-bar/StringSelector";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { ChunkErrorBoundary } from "~/components/patterns/states/ChunkErrorBoundary";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { combineQueryStates } from "~/components/patterns/states/QueryRenderer";
import { StaleOverlay } from "~/components/patterns/states/StaleOverlay";
import { SegmentedItem } from "~/components/ui/segmented";
import { useDateRangeState } from "~/hooks/useDateRangeState";
import { useModeState } from "~/hooks/useModeState";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { getEffectiveRankRange } from "~/lib/game-mode";
import { prefetchSafe } from "~/lib/prefetch-safe";
import { pageTitle, seo } from "~/lib/seo";
import { loadSeasons } from "~/queries/asset-queries";
import { killDeathStatsQueryOptions, mapQueryOptions } from "~/queries/heatmap-queries";

const Heatmap3D = lazy(() => import("~/components/features/heatmap/Heatmap3D"));

const VIEW_MODES = ["kills", "deaths", "kd"] as const;
const VIEW_MODE_LABELS: Record<(typeof VIEW_MODES)[number], string> = {
  kills: "Kills",
  deaths: "Deaths",
  kd: "K/D",
};

export const Route = createFileRoute("/community/heatmap")({
  component: HeatmapPage,
  // Kill/death stats are ~2 MB and only feed a client-side canvas, so they are
  // fetched after hydration instead of being dehydrated into the HTML.
  loader: async ({ context: { queryClient } }) => {
    await Promise.all([prefetchSafe(queryClient.ensureQueryData(mapQueryOptions)), loadSeasons(queryClient)]);
  },
  head: () =>
    seo({
      title: pageTitle("Deadlock Map Heatmaps: Kills & Positions"),
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
  const [outlier, setOutlierSensitivity] = useQueryState("outlier", parseAsInteger.withDefault(9900));
  // The slider's range (80-100%): an edited `?outlier=5000` saturated half the map with the thumb stuck at its minimum.
  const sensitivity = Math.min(10000, Math.max(8000, outlier));
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

  const mapQuery = useQuery(mapQueryOptions);
  // A filter change keeps the old map, dimmed, until the new positions arrive, instead of blanking the page.
  // `useQuery`, not `useQueries`: the latter starts a new observer for the new key, which has no previous data.
  const killDeathQuery = useQuery({ ...killDeathStatsQueryOptions(requestParams), placeholderData: keepPreviousData });

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
        <StringSelector
          label="Team"
          value={String(team)}
          defaultValue="0"
          onValueChange={(next) => setTeam(Number(next))}
        >
          <StringOption value="0">The Hidden King</StringOption>
          <StringOption value="1">The Archmother</StringOption>
        </StringSelector>
        {/* Three segments stay under the auto-wide threshold, but these labels do not fit a default cell. */}
        <FilterToggleCell label="Show" width="wide" value={viewMode} defaultValue="kills" onValueChange={setViewMode}>
          {VIEW_MODES.map((viewModeOption) => (
            <SegmentedItem key={viewModeOption} value={viewModeOption}>
              {VIEW_MODE_LABELS[viewModeOption]}
            </SegmentedItem>
          ))}
        </FilterToggleCell>
        <FilterToggleCell
          label="View"
          value={is3D ? "3d" : "2d"}
          defaultValue="2d"
          onValueChange={(next) => setIs3D(next === "3d")}
        >
          <SegmentedItem value="2d">2D</SegmentedItem>
          <SegmentedItem value="3d">3D</SegmentedItem>
        </FilterToggleCell>
        <Filter.Hero value={heroId} onValueChange={setHeroId} allowNull />
        <Filter.ModeWithRank value={{ mode, rank: [minRankId, maxRankId] }} onValueChange={handleModeWithRankChange} />
        <Filter.SeasonPatchDate
          value={{ startDate, endDate }}
          onValueChange={({ startDate: start, endDate: end, action }) => handleDateChange(start, end, action)}
          defaultValue={{ startDate: defaultRange[0], endDate: defaultRange[1] }}
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
        ) : killDeathQuery.data?.length === 0 ? (
          <EmptyState
            title="No kills or deaths for these filters"
            description="Kill positions cover matches from the last two months only. Try a more recent date range or wider filters."
          />
        ) : mapQuery.data && killDeathQuery.data ? (
          <StaleOverlay active={killDeathQuery.isPlaceholderData} label="heatmap" className="size-full">
            {is3D ? (
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
            )}
          </StaleOverlay>
        ) : null}
      </div>
    </PageShell>
  );
}
