import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiGameStatsRequest, AnalyticsGameStats } from "deadlock_api_client";
import { Fragment, lazy, Suspense, useState } from "react";

import type { StatTrendBucket } from "~/components/patterns/charts/StatTrendChart";
import { Panel, PanelHeader } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Delta } from "~/components/ui/delta";
import { Inline } from "~/components/ui/stack";
import { Text } from "~/components/ui/text";
import { Tooltip } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import { gameStatsQueryOptions } from "~/queries/games-query";

import { CATEGORY_ICONS, formatStatValue, getFilteredCategories } from "./stat-definitions";

const StatTrendChart = lazy(() => import("./StatTrendChart"));

const TOTAL_STATS: ReadonlySet<keyof AnalyticsGameStats> = new Set(["total_matches", "total_players"]);

function windowSeconds(params: AnalyticsApiGameStatsRequest): number {
  return (params.maxUnixTimestamp ?? Date.now() / 1000) - (params.minUnixTimestamp ?? 0);
}

/**
 * Averages compare across any two windows, totals only across windows of about the same length. The
 * default compares the running season with the whole previous one, where the totals always read as a
 * collapse; and players can't be rescaled per day, since one player shows up on many days.
 */
function totalsComparable(params: AnalyticsApiGameStatsRequest, prevParams: AnalyticsApiGameStatsRequest): boolean {
  return Math.abs(windowSeconds(params) / windowSeconds(prevParams) - 1) < 0.1;
}

interface GamesOverviewProps {
  params: AnalyticsApiGameStatsRequest;
  prevParams: AnalyticsApiGameStatsRequest | null;
  onStatClick?: (statKey: string) => void;
  isStreetBrawl?: boolean;
}

export default function GamesOverview({ params, prevParams, onStatClick, isStreetBrawl = false }: GamesOverviewProps) {
  const [trendBucket, setTrendBucket] = useState<StatTrendBucket>("start_time_day");
  const {
    data: currentData,
    isPending,
    isError,
    refetch,
  } = useQuery(gameStatsQueryOptions({ ...params, bucket: "no_bucket" }));
  const { data: prevData } = useQuery({
    ...gameStatsQueryOptions({ ...(prevParams as AnalyticsApiGameStatsRequest), bucket: "no_bucket" }),
    enabled: prevParams != null,
  });

  if (isPending) {
    return <LoadingState label="game stats" className="flex items-center justify-center py-16" />;
  }

  if (isError && !currentData) {
    return <ErrorState title="Game stats did not load" onRetry={() => void refetch()} />;
  }

  const current = currentData?.[0];
  if (!current) {
    return <EmptyState variant="inline" title="No data available for the selected filters." />;
  }

  const prev = prevData?.[0];
  const compareTotals = prevParams != null && totalsComparable(params, prevParams);
  const teamWinTotal = current.team0_wins + current.team1_wins;
  const prevTeamWinTotal = prev ? prev.team0_wins + prev.team1_wins : 0;
  const teamWinRow =
    teamWinTotal > 0 ? (
      <Inline justify="between" gap={3} wrap="nowrap" className="px-4 py-2.5 @2xl:col-span-2">
        <Text tone="muted" className="@2xl:shrink-0">
          The Hidden King vs The Archmother
        </Text>
        <div className="flex flex-wrap items-center justify-end gap-x-2.5 gap-y-1">
          <Inline gap={1} wrap="nowrap" className="text-sm font-semibold tabular-nums">
            <span className="text-primary">{((current.team0_wins / teamWinTotal) * 100).toFixed(2)}%</span>
            <span className="text-muted-foreground">:</span>
            <span className="text-info">{((current.team1_wins / teamWinTotal) * 100).toFixed(2)}%</span>
          </Inline>
          {prev && prevTeamWinTotal > 0 && (
            <Badge variant="muted" shape="square">
              <span className="text-primary">{((prev.team0_wins / prevTeamWinTotal) * 100).toFixed(2)}%</span>
              <span>:</span>
              <span className="text-info">{((prev.team1_wins / prevTeamWinTotal) * 100).toFixed(2)}%</span>
            </Badge>
          )}
        </div>
      </Inline>
    ) : null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {getFilteredCategories(isStreetBrawl).map((category) => {
        const Icon = CATEGORY_ICONS[category.label];
        // Fields the game stopped reporting still come back as an exact 0 average.
        const stats = category.stats.filter((stat) => current[stat.key] !== 0);
        if (stats.length === 0) return null;
        const isWide = stats.length > 6;

        return (
          <Panel key={category.label} className={cn("@container", isWide && "lg:col-span-2")}>
            <PanelHeader title={category.label} icon={Icon} size="sm" />

            <div className={cn(isWide && "@2xl:grid @2xl:grid-cols-2")}>
              {stats.map((stat) => {
                const value = current[stat.key] as number;
                const prevValue =
                  TOTAL_STATS.has(stat.key) && !compareTotals ? undefined : (prev?.[stat.key] as number | undefined);
                // Rounded to the displayed tenth of a percent so the arrow and colour agree with the printed value.
                // A rate changes in points (2% to 3% is +1.0 pp); a relative change of it (+50%) read as the new rate.
                const inPoints = stat.format === "percent";
                const delta =
                  prevValue == null
                    ? null
                    : inPoints
                      ? Math.round((value - prevValue) * 1000) / 1000
                      : prevValue !== 0
                        ? Math.round(((value - prevValue) / Math.abs(prevValue)) * 1000) / 1000
                        : null;

                return (
                  <Fragment key={stat.key}>
                    <Tooltip
                      variant="preview"
                      side="bottom"
                      align="end"
                      content={
                        <Suspense
                          fallback={<LoadingState label="trend" className="flex h-62.5 items-center justify-center" />}
                        >
                          <StatTrendChart
                            params={params}
                            stat={stat}
                            value={trendBucket}
                            onValueChange={setTrendBucket}
                          />
                        </Suspense>
                      }
                    >
                      <Button
                        variant="row"
                        className="justify-between px-4 py-2.5"
                        onClick={() => onStatClick?.(stat.key)}
                      >
                        <span className="text-start text-sm text-muted-foreground">{stat.label}</span>
                        <div className="flex items-center gap-2.5">
                          <span className="text-sm font-semibold tabular-nums">
                            {formatStatValue(value, stat.format)}
                          </span>
                          {delta != null && (
                            <Delta
                              value={delta}
                              unit={inPoints ? " pp" : undefined}
                              invert={stat.lowerIsBetter}
                              sign="arrow"
                              display="badge"
                              className="min-w-13 font-normal"
                            />
                          )}
                        </div>
                      </Button>
                    </Tooltip>
                    {stat.key === "total_players" && teamWinRow}
                  </Fragment>
                );
              })}
            </div>
          </Panel>
        );
      })}
    </div>
  );
}
