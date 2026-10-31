import { useQueries, useQuery } from "@tanstack/react-query";
import { SearchX } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { BuildDetailPanel } from "~/components/features/builds/BuildDetailPanel";
import { BuildInMatches } from "~/components/features/builds/BuildInMatches";
import { BuildItemsPanel } from "~/components/features/builds/BuildItemsPanel";
import { BuildScatterChart } from "~/components/features/builds/BuildScatterChart";
import { BuildTable } from "~/components/features/builds/BuildTable";
import { Section } from "~/components/patterns/page/Section";
import { PanelRow } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { StaleOverlay } from "~/components/patterns/states/StaleOverlay";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { day, type Dayjs } from "~/dayjs";
import type { BuildIdChoice } from "~/hooks/useBuildLookup";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { poolPerformance } from "~/lib/build-performance";
import {
  type BuildMeta,
  buildMatchesMeta,
  type BuildMetaFilters,
  buildRows,
  buildTrends,
  hasBuildMetaFilters,
  NO_BUILD_META_FILTERS,
  summarizeBuilds,
} from "~/lib/build-stats";
import type { MatchMode } from "~/lib/game-mode";
import { useDebouncedValue } from "~/lib/utils";
import type { HeroBuild } from "~/lib/wasm/hero-build";
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
  /** Match length in seconds; undefined for no bound. */
  minDurationS?: number;
  maxDurationS?: number;
  minMatches: number;
  /** Builds played by fewer players are left out; counted here, the endpoint has no such filter. */
  minPlayers: number;
  /** Tags, language and last update: builds that miss them are left out, like those under the minimum players. */
  metaFilters?: BuildMetaFilters;
  matchMode: MatchMode;
  /** The build the detail panel shows; the most played one when null or not in the results. */
  buildId: number | null;
  onBuildIdChange: (buildId: number) => void;
  /** A build the list's search found by its ID or game code, perhaps another hero's: the page shows it. */
  onBuildFound?: (choice: BuildIdChoice) => void;
  /** A game code the search was given of a build that is not published. */
  onUnpublishedBuild?: (build: HeroBuild) => void;
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
  minDurationS,
  maxDurationS,
  minMatches,
  matchMode,
}: Pick<
  BuildsExplorerProps,
  "heroId" | "minRankId" | "maxRankId" | "minDurationS" | "maxDurationS" | "minMatches" | "matchMode"
> & {
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
    minDurationS,
    maxDurationS,
    minMatches,
  };
}

/** The content requests of an answer's builds, in the loader's batches. */
function metaQueries(heroId: number, stats: readonly { hero_build_id: number }[] | undefined) {
  return buildMetaBatches(stats?.map((row) => row.hero_build_id) ?? []).map((batch) =>
    heroBuildMetaQueryOptions(heroId, batch),
  );
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

/**
 * The tags and languages of the builds the filters other than tags, language and update leave: what the build filters
 * offer, most used first. The same requests the explorer makes, so they come from its cache.
 */
export function useBuildFacets(
  props: Pick<
    BuildsExplorerProps,
    | "heroId"
    | "minRankId"
    | "maxRankId"
    | "minDate"
    | "maxDate"
    | "minDurationS"
    | "maxDurationS"
    | "minMatches"
    | "minPlayers"
    | "matchMode"
  >,
): { tagIds: number[]; languages: number[] } {
  const { minUnixTimestamp, maxUnixTimestamp } = useNormalizedTimeRange(props.minDate, props.maxDate);
  const statsQuery = useQuery(
    heroBuildStatsQueryOptions(heroBuildStatsRequest({ ...props, minUnixTimestamp, maxUnixTimestamp })),
  );
  const meta = useQueries({ queries: metaQueries(props.heroId, statsQuery.data), combine: combineMeta });
  return useMemo(() => {
    const tags = new Map<number, number>();
    const languages = new Map<number, number>();
    for (const row of statsQuery.data ?? []) {
      const build = meta.builds.get(row.hero_build_id);
      if (!build || row.players < props.minPlayers) continue;
      for (const tag of build.tags) tags.set(tag, (tags.get(tag) ?? 0) + 1);
      languages.set(build.language, (languages.get(build.language) ?? 0) + 1);
    }
    const byCount = (counts: Map<number, number>) =>
      [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([id]) => id);
    return { tagIds: byCount(tags), languages: byCount(languages) };
  }, [statsQuery.data, meta.builds, props.minPlayers]);
}

/** The filters an answer was asked with: while the next filters' builds load, the last ones stay on screen with them. */
type ExplorerFilters = Pick<
  BuildsExplorerProps,
  | "heroId"
  | "minRankId"
  | "maxRankId"
  | "minDate"
  | "maxDate"
  | "minDurationS"
  | "maxDurationS"
  | "minMatches"
  | "matchMode"
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
  // The builds' names and contents too: the build panel's height follows them, so the last answer stays until the new
  // one can show whole rather than grow under a skeleton.
  const metaPending = useQueries({
    queries: metaQueries(props.heroId, statsQuery.data),
    combine: (results) => results.some((result) => result.isPending),
  });
  const answered = (statsQuery.data !== undefined && !metaPending) || statsQuery.isError;
  const [settled, setSettled] = useState<{ key: string; filters: ExplorerFilters } | null>(null);
  if (answered && settled?.key !== key) {
    const { heroId, minRankId, maxRankId, minDate, maxDate, minDurationS, maxDurationS, minMatches, matchMode } = props;
    setSettled({
      key,
      filters: { heroId, minRankId, maxRankId, minDate, maxDate, minDurationS, maxDurationS, minMatches, matchMode },
    });
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
  minDurationS,
  maxDurationS,
  minMatches,
  minPlayers,
  metaFilters = NO_BUILD_META_FILTERS,
  matchMode,
  buildId,
  onBuildIdChange,
  onBuildFound,
  onUnpublishedBuild,
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
        minDurationS,
        maxDurationS,
      }),
    ),
  );
  // Asked for every build of the answer, not only those past the minimum players: the same batches the loader warms.
  const meta = useQueries({
    queries: metaQueries(heroId, statsQuery.data),
    combine: combineMeta,
  });
  // Left out before anything is counted, as the minimum matches is: the totals and the average stay those of the
  // listed builds.
  const stats = useMemo(
    () =>
      statsQuery.data?.filter(
        (row) => row.players >= minPlayers && buildMatchesMeta(meta.builds.get(row.hero_build_id), metaFilters),
      ),
    [statsQuery.data, minPlayers, meta.builds, metaFilters],
  );

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
        minDurationS,
        maxDurationS,
      }),
    ),
    enabled: stats !== undefined,
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
        minDurationS,
        maxDurationS,
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
      minDurationS,
      maxDurationS,
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
  // The list and the build sit in a row as tall as the taller of them: a pick holds the row's height until the filters
  // change, so a build with shorter details never pulls the page below up. Read in the handler, not while rendering.
  const answerKey = JSON.stringify([
    heroId,
    minRankId,
    maxRankId,
    minUnixTimestamp,
    maxUnixTimestamp,
    minDurationS,
    maxDurationS,
    minMatches,
    minPlayers,
    metaFilters,
    matchMode,
  ]);
  const rowRef = useRef<HTMLDivElement>(null);
  const [heldRow, setHeldRow] = useState<{ key: string; height: number } | null>(null);
  const pickBuild = (id: number) => {
    // Side by side only: stacked, the build sits under the list and a held height would stretch the list instead.
    const [list, build] = rowRef.current?.firstElementChild?.children ?? [];
    const sideBySide = list && build && build.getBoundingClientRect().top === list.getBoundingClientRect().top;
    const height = sideBySide ? rowRef.current?.getBoundingClientRect().height : undefined;
    if (height !== undefined) {
      const held = heldRow?.key === answerKey ? heldRow.height : 0;
      setHeldRow({ key: answerKey, height: Math.max(height, held) });
    }
    onBuildIdChange(id);
  };

  // The build filters read the builds' contents: until they arrive every build would fail them.
  if (statsQuery.isPending || (hasBuildMetaFilters(metaFilters) && meta.pending)) return <LoadingState />;
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
        description={
          hasBuildMetaFilters(metaFilters)
            ? "No build with these tags, language and update date reached the minimum matches and players. Lower a minimum or widen the filters."
            : "No published build reached the minimum matches and players. Lower a minimum or widen the filters."
        }
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
    minDurationS,
    maxDurationS,
  };
  const performancePending = performanceQuery.isPending && performanceQuery.fetchStatus !== "idle";

  return (
    // Overview first, details on demand: the list and the build picked from it, then what its players do in their
    // matches, and last the chart and items that compare every build at once.
    <StaleOverlay active={stale} label="builds" className="@container flex flex-col gap-3">
      {/* A build asked for by its ID that these filters leave out: the list shows another, and says why. Not while the
          last filters' builds stand in for the next ones, which may well hold it. */}
      {!stale && buildId !== null && selected.hero_build_id !== buildId && (
        <Alert variant="info" live="polite">
          <SearchX aria-hidden="true" />
          <AlertTitle>Build {buildId} is not in this list</AlertTitle>
          <AlertDescription>
            {hasBuildMetaFilters(metaFilters)
              ? `Its tags, language or update date do not match, or it has fewer than ${minMatches} matches${minPlayers > 1 ? ` or ${minPlayers} players` : ""} under these filters.`
              : `It has fewer than ${minMatches} matches${minPlayers > 1 ? ` or ${minPlayers} players` : ""} under these filters, or none.`}
            {onMinMatchesChange && minMatches > 1 && (
              <Button variant="outline" size="sm" onClick={() => onMinMatchesChange(1)}>
                Show builds with 1+ matches
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      {/* As tall as the taller of the two, up to a cap: no empty room under both when the builds are few. */}
      <PanelRow
        ref={rowRef}
        at="3xl"
        height="fit"
        style={heldRow?.key === answerKey ? { minHeight: heldRow.height } : undefined}
      >
        <BuildTable
          heroId={heroId}
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
          onBuildIdChange={pickBuild}
          onBuildFound={onBuildFound}
          onUnpublishedBuild={onUnpublishedBuild}
          onBuildHover={setHoveredId}
          highlightedId={hoveredId}
          // Stacked, the list grows with its builds up to one height and scrolls inside it rather than pushing the
          // build below away; a search holds its height, so emptying it moves nothing.
          className="max-h-list-pane"
        />
        <BuildDetailPanel
          row={selected}
          authorBuilds={rows.filter(
            (row) =>
              row.hero_build_id !== selected.hero_build_id &&
              row.meta != null &&
              row.meta.authorId === selected.meta?.authorId,
          )}
          onBuildIdChange={pickBuild}
          purchaseFilters={purchaseFilters}
          active={settled}
          heroId={heroId}
          profile={selected.meta ? profiles.byId[selected.meta.authorId] : undefined}
          pending={meta.pending}
          profilePending={profiles.pending}
        />
      </PanelRow>
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
        {/* Side by side only where the items panel's names and two metrics fit beside the chart. */}
        <div className="grid gap-3 @5xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <BuildScatterChart
            rows={rows}
            average={summary.winRate}
            selectedId={selected.hero_build_id}
            highlightedId={hoveredId}
            previewItemId={hoveredItemId}
            onBuildIdChange={pickBuild}
            onBuildHover={setHoveredId}
            performance={performance}
          />
          <BuildItemsPanel
            rows={rows}
            pending={meta.pending}
            onItemHover={setHoveredItemId}
            // Beside the chart it takes the chart's height and scrolls; stacked it grows with its list.
            className="@5xl:h-0 @5xl:min-h-full"
          />
        </div>
      </Section>
    </StaleOverlay>
  );
}
