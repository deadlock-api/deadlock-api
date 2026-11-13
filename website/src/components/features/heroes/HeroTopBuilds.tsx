import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";

import { Panel, PanelFooter, PanelHeader } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Delta } from "~/components/ui/delta";
import { Skeleton } from "~/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableRowHeader } from "~/components/ui/table";
import { TextLink } from "~/components/ui/text-link";
import { type BuildStatRow, buildRows } from "~/lib/build-stats";
import { formatPercent } from "~/lib/format";
import {
  type HeroBuildStatsParams,
  heroBuildMetaQueryOptions,
  heroBuildStatsQueryOptions,
} from "~/queries/hero-build-stats-query";

const TOP_BUILD_COUNT = 8;

/** Builds with fewer matches are left out, as on the Build Stats page: their win rates are noise. */
export const TOP_BUILDS_MIN_MATCHES = 20;

/**
 * The ids of the most played builds, sorted by id: the loader and the panel ask for the names of the same builds in
 * the same order, so the server's answer is the panel's cache entry.
 */
export function topBuildIds(stats: readonly BuildStatRow[]): number[] {
  return [...stats]
    .sort((a, b) => b.matches - a.matches)
    .slice(0, TOP_BUILD_COUNT)
    .map((row) => row.hero_build_id)
    .sort((a, b) => a - b);
}

/**
 * The published builds players start the hero's matches with, most played first: how often each was played, how it
 * won, and the gap to the hero's other builds, colored only where it stands out of its sample's noise.
 */
export function HeroTopBuilds({
  heroName,
  request,
  rankRange,
  className,
}: {
  className?: string;
  heroName: string;
  request: HeroBuildStatsParams;
  /** The request's rank range in words, such as "Phantom 1+". */
  rankRange: string;
}) {
  const { heroId } = request;
  const statsQuery = useQuery(heroBuildStatsQueryOptions(request));
  const ids = useMemo(() => (statsQuery.data ? topBuildIds(statsQuery.data) : []), [statsQuery.data]);
  const metaQuery = useQuery({ ...heroBuildMetaQueryOptions(heroId, ids), enabled: ids.length > 0 });

  // Against every listed build, so a build's gap is to the hero's builds as a whole, as on the Build Stats page.
  const rows = useMemo(() => {
    if (!statsQuery.data) return null;
    const meta = metaQuery.data ? new Map(Object.entries(metaQuery.data).map(([id, m]) => [Number(id), m])) : undefined;
    return buildRows(statsQuery.data, meta)
      .sort((a, b) => b.matches - a.matches)
      .slice(0, TOP_BUILD_COUNT);
  }, [statsQuery.data, metaQuery.data]);

  const buildsLink = (buildId?: number) => ({
    hero: heroId,
    ...(buildId !== undefined && { build: buildId }),
  });

  return (
    <Panel className={className}>
      <PanelHeader title={`Top ${heroName} Builds`} description={`${rankRange} · most played`} />
      {statsQuery.isError && !statsQuery.data ? (
        <ErrorState
          variant="inline"
          title={`Could not load the ${heroName} builds`}
          retrying={statsQuery.isFetching}
          onRetry={() => void statsQuery.refetch()}
          className="p-4"
        />
      ) : !rows ? (
        <LoadingState label="top builds" variant="skeleton" className="p-4" />
      ) : rows.length === 0 ? (
        <EmptyState variant="inline" title={`No ${heroName} build has enough matches to rank yet`} className="p-4" />
      ) : (
        <div className="@container/top-builds flex flex-1 flex-col">
          <Table aria-label={`Most played ${heroName} builds`} height="fill">
            <TableHeader tone="muted">
              <TableRow>
                <TableHead className="hidden text-end @sm/top-builds:table-cell">#</TableHead>
                <TableHead>Build</TableHead>
                <TableHead className="text-end">Matches</TableHead>
                <TableHead className="text-end">Win Rate</TableHead>
                <TableHead className="hidden text-end @sm/top-builds:table-cell">vs Avg</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => (
                <TableRow key={row.hero_build_id}>
                  <TableCell className="hidden text-end text-muted-foreground tabular-nums @sm/top-builds:table-cell">
                    {index + 1}
                  </TableCell>
                  <TableRowHeader className="w-full max-w-0">
                    <div className="flex min-w-0 flex-col">
                      {row.meta ? (
                        <TextLink asChild tone="inherit" className="block truncate font-medium">
                          <Link to="/analytics/builds" search={buildsLink(row.hero_build_id)} preload="intent">
                            {row.meta.name}
                          </Link>
                        </TextLink>
                      ) : metaQuery.isPending ? (
                        <>
                          <Skeleton className="h-5 w-40 max-w-full" />
                          <span className="sr-only">Build {row.hero_build_id}</span>
                        </>
                      ) : (
                        <TextLink asChild tone="inherit" className="block truncate font-medium">
                          <Link to="/analytics/builds" search={buildsLink(row.hero_build_id)} preload="intent">
                            Build {row.hero_build_id}
                          </Link>
                        </TextLink>
                      )}
                      <span className="truncate text-xs text-muted-foreground tabular-nums">
                        {row.players.toLocaleString("en-US")} players · ID {row.hero_build_id}
                      </span>
                    </div>
                  </TableRowHeader>
                  <TableCell className="text-end tabular-nums">{row.matches.toLocaleString("en-US")}</TableCell>
                  <TableCell className="text-end font-semibold tabular-nums">{formatPercent(row.winRate)}</TableCell>
                  <TableCell className="hidden text-end @sm/top-builds:table-cell">
                    <Delta
                      value={row.vsAverage}
                      unit=" pp"
                      significant={row.verdict !== "even"}
                      zero="visible"
                      className="justify-end"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <PanelFooter className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1">
        <TextLink asChild>
          <Link to="/analytics/builds" search={buildsLink()} preload="intent">
            All {heroName} builds
          </Link>
        </TextLink>
      </PanelFooter>
    </Panel>
  );
}
