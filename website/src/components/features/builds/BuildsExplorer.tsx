import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { BuildDetailPanel } from "~/components/features/builds/BuildDetailPanel";
import { BuildItemsPanel } from "~/components/features/builds/BuildItemsPanel";
import { BuildScatterChart } from "~/components/features/builds/BuildScatterChart";
import { BuildTable } from "~/components/features/builds/BuildTable";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { day, type Dayjs } from "~/dayjs";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { poolPerformance } from "~/lib/build-performance";
import { type BuildMeta, buildRows, buildTrends, summarizeBuilds } from "~/lib/build-stats";
import type { MatchMode } from "~/lib/game-mode";
import {
  buildMetaBatches,
  heroBuildMetaQueryOptions,
  heroBuildPerformanceQueryOptions,
  heroBuildStatsQueryOptions,
} from "~/queries/hero-build-stats-query";
import { type SteamProfileMap, steamProfileBatches, steamProfilesQueryOptions } from "~/queries/steam-queries";

/** How many days at the end of the range the trend looks at. */
const TREND_WINDOW_DAYS = 7;

export interface BuildsExplorerProps {
  heroId: number;
  /** Undefined where the mode has no rank (unranked lobbies). */
  minRankId?: number;
  maxRankId?: number;
  minDate?: Dayjs;
  maxDate?: Dayjs;
  minMatches: number;
  matchMode: MatchMode;
  /** The build the detail panel shows; the most played one when null or not in the results. */
  buildId: number | null;
  onBuildIdChange: (buildId: number) => void;
}

/** The request the page's loader warms and the explorer reads, from the same filters. */
export function heroBuildStatsRequest({
  heroId,
  minRankId,
  maxRankId,
  minUnixTimestamp,
  maxUnixTimestamp,
  minMatches,
  matchMode,
}: Pick<BuildsExplorerProps, "heroId" | "minRankId" | "maxRankId" | "minMatches" | "matchMode"> & {
  minUnixTimestamp?: number;
  maxUnixTimestamp?: number;
}) {
  return {
    heroId,
    matchMode,
    minAverageBadge: minRankId,
    maxAverageBadge: maxRankId,
    minUnixTimestamp,
    maxUnixTimestamp,
    minMatches,
  };
}

// Module level, so useQueries keeps the combined value while no batch changes.
function combineMeta(results: { data?: Record<number, BuildMeta | null>; isPending: boolean }[]) {
  const builds = new Map<number, BuildMeta | null>();
  for (const result of results) {
    for (const [id, build] of Object.entries(result.data ?? {})) builds.set(Number(id), build);
  }
  return { builds, pending: results.some((result) => result.isPending) };
}

function combineProfiles(results: { data?: SteamProfileMap; isPending: boolean }[]) {
  const byId: SteamProfileMap = {};
  for (const result of results) Object.assign(byId, result.data);
  return { byId, pending: results.some((result) => result.isPending) };
}

export function BuildsExplorer({
  heroId,
  minRankId,
  maxRankId,
  minDate,
  maxDate,
  minMatches,
  matchMode,
  buildId,
  onBuildIdChange,
}: BuildsExplorerProps) {
  const { minUnixTimestamp, maxUnixTimestamp } = useNormalizedTimeRange(minDate, maxDate);
  const statsQuery = useQuery(
    heroBuildStatsQueryOptions(
      heroBuildStatsRequest({
        heroId,
        minRankId,
        maxRankId,
        minUnixTimestamp,
        maxUnixTimestamp,
        minMatches,
        matchMode,
      }),
    ),
  );
  const stats = statsQuery.data;

  // The range's last days, against which each build's share is compared. An open range ends today (UTC).
  const windowEnd = maxUnixTimestamp ?? day.utc().startOf("day").add(1, "day").unix();
  const recentQuery = useQuery({
    ...heroBuildStatsQueryOptions(
      heroBuildStatsRequest({
        heroId,
        minRankId,
        maxRankId,
        minUnixTimestamp: Math.max(minUnixTimestamp ?? 0, windowEnd - TREND_WINDOW_DAYS * 86_400),
        maxUnixTimestamp,
        minMatches: 1,
        matchMode,
      }),
    ),
    enabled: stats !== undefined,
  });

  const meta = useQueries({
    queries: buildMetaBatches(stats?.map((row) => row.hero_build_id) ?? []).map((batch) =>
      heroBuildMetaQueryOptions(heroId, batch),
    ),
    combine: combineMeta,
  });

  const rows = useMemo(() => (stats ? buildRows(stats, meta.builds) : []), [stats, meta.builds]);
  const summary = useMemo(() => summarizeBuilds(rows), [rows]);
  const performanceQuery = useQuery({
    ...heroBuildPerformanceQueryOptions(
      heroBuildStatsRequest({
        heroId,
        minRankId,
        maxRankId,
        minUnixTimestamp,
        maxUnixTimestamp,
        minMatches,
        matchMode,
      }),
    ),
    enabled: stats !== undefined,
  });
  const performance = performanceQuery.data;
  const averagePerformance = useMemo(
    () =>
      performance
        ? poolPerformance(
            rows.flatMap((row) => (performance[row.hero_build_id] ? [performance[row.hero_build_id]] : [])),
          )
        : null,
    [performance, rows],
  );
  const recent = recentQuery.data;
  const trends = useMemo(() => (recent ? buildTrends(rows, recent) : null), [rows, recent]);

  const authorIds = rows.flatMap((row) => (row.meta ? [row.meta.authorId] : []));
  const profiles = useQueries({
    queries: steamProfileBatches(authorIds).map((batch) => steamProfilesQueryOptions(batch)),
    combine: combineProfiles,
  });

  if (statsQuery.isPending) return <LoadingState />;
  if (statsQuery.isError) {
    return (
      <ErrorState
        title="Build stats failed to load"
        onRetry={() => void statsQuery.refetch()}
        retrying={statsQuery.isFetching}
      />
    );
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No builds in these matches"
        description="No published build reached the minimum number of matches. Lower the minimum or widen the filters."
      />
    );
  }

  const selected = rows.find((row) => row.hero_build_id === buildId) ?? rows[0];

  return (
    <div className="@container flex flex-col gap-3">
      <div className="grid gap-3 @3xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <BuildScatterChart
          rows={rows}
          average={summary.winRate}
          selectedId={selected.hero_build_id}
          onBuildIdChange={onBuildIdChange}
        />
        <BuildItemsPanel
          rows={rows}
          pending={meta.pending}
          className="max-h-120 @3xl:h-0 @3xl:max-h-none @3xl:min-h-full"
        />
      </div>
      <div className="grid gap-3 @3xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <BuildTable
          rows={rows}
          trends={trends}
          trendsPending={recentQuery.isPending}
          performance={performance}
          averagePerformance={averagePerformance}
          summary={summary}
          performancePending={performanceQuery.isPending && performanceQuery.fetchStatus !== "idle"}
          profiles={profiles.byId}
          metaPending={meta.pending}
          profilesPending={profiles.pending}
          selectedId={selected.hero_build_id}
          onBuildIdChange={onBuildIdChange}
        />
        <BuildDetailPanel
          row={selected}
          rows={rows}
          performanceById={performance}
          authorBuilds={rows.filter(
            (row) =>
              row.hero_build_id !== selected.hero_build_id &&
              row.meta != null &&
              row.meta.authorId === selected.meta?.authorId,
          )}
          onBuildIdChange={onBuildIdChange}
          performance={performance?.[selected.hero_build_id]}
          averagePerformance={averagePerformance}
          performancePending={performanceQuery.isPending && performanceQuery.fetchStatus !== "idle"}
          purchaseFilters={{
            gameMode: "normal",
            matchMode,
            minAverageBadge: minRankId,
            maxAverageBadge: maxRankId,
            minUnixTimestamp,
            maxUnixTimestamp,
          }}
          trend={trends?.get(selected.hero_build_id)}
          heroId={heroId}
          profile={selected.meta ? profiles.byId[selected.meta.authorId] : undefined}
          pending={meta.pending}
          profilePending={profiles.pending}
          className="@3xl:h-0 @3xl:min-h-full"
        />
      </div>
    </div>
  );
}
