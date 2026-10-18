import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { BuildDetailPanel } from "~/components/features/builds/BuildDetailPanel";
import { BuildInMatches } from "~/components/features/builds/BuildInMatches";
import { BuildItemsPanel } from "~/components/features/builds/BuildItemsPanel";
import { BuildScatterChart } from "~/components/features/builds/BuildScatterChart";
import { BuildTable } from "~/components/features/builds/BuildTable";
import { Section } from "~/components/patterns/page/Section";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { StaleOverlay } from "~/components/patterns/states/StaleOverlay";
import { Button } from "~/components/ui/button";
import { day, type Dayjs } from "~/dayjs";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { poolPerformance } from "~/lib/build-performance";
import { type BuildMeta, buildRows, buildTrends, summarizeBuilds } from "~/lib/build-stats";
import type { MatchMode } from "~/lib/game-mode";
import { useDebouncedValue } from "~/lib/utils";
import {
  buildMetaBatches,
  heroBuildMetaQueryOptions,
  heroBuildPerformanceQueryOptions,
  heroBuildStatsQueryOptions,
} from "~/queries/hero-build-stats-query";
import { heroStatsQueryOptions } from "~/queries/hero-stats-query";
import { type SteamProfileMap, steamProfileBatches, steamProfilesQueryOptions } from "~/queries/steam-queries";

/** How many days at the end of the range the trend looks at. */
const TREND_WINDOW_DAYS = 7;

/** The minimum the empty state offers to lower to. */
const LOW_MIN_MATCHES = 5;

/** How long the selection must rest before the selected build's details are asked for. */
const SETTLE_MS = 300;

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
  /** Lowers the minimum from the empty state. */
  onMinMatchesChange?: (minMatches: number) => void;
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

/** The filters an answer was asked with: while the next filters' builds load, the last ones stay on screen with them. */
type ExplorerFilters = Pick<
  BuildsExplorerProps,
  "heroId" | "minRankId" | "maxRankId" | "minDate" | "maxDate" | "minMatches" | "matchMode"
>;

/**
 * Every build of a hero under the page's filters. A changed filter keeps the last builds on screen, washed out and
 * announced busy, until the new ones arrive, instead of dropping the page to a loading state and growing it back.
 */
export function BuildsExplorer(props: BuildsExplorerProps) {
  const { minUnixTimestamp, maxUnixTimestamp } = useNormalizedTimeRange(props.minDate, props.maxDate);
  const request = heroBuildStatsRequest({ ...props, minUnixTimestamp, maxUnixTimestamp });
  const statsQuery = useQuery(heroBuildStatsQueryOptions(request));
  const key = JSON.stringify(request);
  const answered = statsQuery.data !== undefined || statsQuery.isError;
  const [settled, setSettled] = useState<{ key: string; filters: ExplorerFilters } | null>(null);
  if (answered && settled?.key !== key) {
    const { heroId, minRankId, maxRankId, minDate, maxDate, minMatches, matchMode } = props;
    setSettled({ key, filters: { heroId, minRankId, maxRankId, minDate, maxDate, minMatches, matchMode } });
  }
  const stale = !answered && settled !== null;
  return <BuildsExplorerView {...props} {...(stale ? settled.filters : {})} stale={stale} />;
}

function BuildsExplorerView({
  heroId,
  minRankId,
  maxRankId,
  minDate,
  maxDate,
  minMatches,
  matchMode,
  buildId,
  onBuildIdChange,
  onMinMatchesChange,
  stale,
}: BuildsExplorerProps & {
  /** The last filters' builds, shown while the page's filters load. */
  stale: boolean;
}) {
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
        // Builds with one or two matches in the window are a long tail of builds too small for the list: leaving them
        // out cuts the answer by about 70% for a share change of under a tenth of a point.
        minMatches: 3,
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
  // Every player of the hero in the same matches, to read the builds' pooled win rate against. The heroes page asks for
  // the same request, so it is often cached.
  const heroStatsQuery = useQuery({
    ...heroStatsQueryOptions({
      gameMode: "normal",
      matchMode,
      minAverageBadge: minRankId,
      maxAverageBadge: maxRankId,
      minUnixTimestamp,
      maxUnixTimestamp,
    }),
    select: (rows) => rows.find((row) => row.hero_id === heroId),
  });
  const heroRow = heroStatsQuery.data;
  const heroWinRate = heroRow && heroRow.matches > 0 ? heroRow.wins / heroRow.matches : undefined;
  const recent = recentQuery.data;
  const trends = useMemo(() => (recent ? buildTrends(rows, recent) : null), [rows, recent]);

  const authorIds = rows.flatMap((row) => (row.meta ? [row.meta.authorId] : []));
  const profiles = useQueries({
    queries: steamProfileBatches(authorIds).map((batch) => steamProfilesQueryOptions(batch)),
    combine: combineProfiles,
  });

  // Stepping through the list with the keys would fire every request of every build passed over: the selected build's
  // details are asked for once the selection has rested, and show their loading states until then.
  const selectedId = (rows.find((row) => row.hero_build_id === buildId) ?? rows.at(0))?.hero_build_id ?? null;
  // The first build after the list loads is asked for at once: nothing was passed over to get to it.
  const restedId = useDebouncedValue(selectedId, SETTLE_MS);
  const settled = restedId === selectedId || restedId === null;
  // The list row under the pointer, lit on the chart.
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  // The item under the pointer in the items panel: the chart fades the builds that do not list it.
  const [hoveredItemId, setHoveredItemId] = useState<number | null>(null);

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
        action={
          onMinMatchesChange &&
          minMatches > LOW_MIN_MATCHES && (
            <Button variant="outline" size="sm" onClick={() => onMinMatchesChange(LOW_MIN_MATCHES)}>
              Show builds with {LOW_MIN_MATCHES}+ matches
            </Button>
          )
        }
      />
    );
  }

  const selected = rows.find((row) => row.hero_build_id === buildId) ?? rows[0];
  const purchaseFilters = {
    gameMode: "normal" as const,
    matchMode,
    minAverageBadge: minRankId,
    maxAverageBadge: maxRankId,
    minUnixTimestamp,
    maxUnixTimestamp,
  };
  const performancePending = performanceQuery.isPending && performanceQuery.fetchStatus !== "idle";

  return (
    // Overview first, details on demand: the list and the build picked from it, then what its players do in their
    // matches, and last the chart and items that compare every build at once.
    <StaleOverlay active={stale} label="builds" className="@container flex flex-col gap-3">
      <div className="grid gap-3 @3xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <BuildTable
          rows={rows}
          trends={trends}
          trendsPending={recentQuery.isPending}
          performance={performance}
          averagePerformance={averagePerformance}
          summary={summary}
          heroWinRate={heroWinRate}
          performancePending={performancePending}
          profiles={profiles.byId}
          metaPending={meta.pending}
          profilesPending={profiles.pending}
          selectedId={selected.hero_build_id}
          onBuildIdChange={onBuildIdChange}
          onBuildHover={setHoveredId}
          highlightedId={hoveredId}
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
          purchaseFilters={purchaseFilters}
          active={settled}
          heroId={heroId}
          profile={selected.meta ? profiles.byId[selected.meta.authorId] : undefined}
          pending={meta.pending}
          profilePending={profiles.pending}
          className="@3xl:h-0 @3xl:min-h-full"
        />
      </div>
      <BuildInMatches
        heroId={heroId}
        row={selected}
        filters={purchaseFilters}
        active={settled}
        performance={performance?.[selected.hero_build_id]}
        averagePerformance={averagePerformance}
        performancePending={performancePending}
      />
      <Section title="All builds compared" className="gap-3 pt-3">
        <div className="grid gap-3 @3xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <BuildScatterChart
            rows={rows}
            average={summary.winRate}
            selectedId={selected.hero_build_id}
            highlightedId={hoveredId}
            previewItemId={hoveredItemId}
            onBuildIdChange={onBuildIdChange}
            onBuildHover={setHoveredId}
            performance={performance}
          />
          <BuildItemsPanel
            rows={rows}
            pending={meta.pending}
            onItemHover={setHoveredItemId}
            className="max-h-120 @3xl:h-0 @3xl:max-h-none @3xl:min-h-full"
          />
        </div>
      </Section>
    </StaleOverlay>
  );
}
