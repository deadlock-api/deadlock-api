import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiGameStatsRequest, AnalyticsGameStats, GameStatsBucketEnum } from "deadlock_api_client";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Fragment, lazy, Suspense, useState } from "react";

import { LoadingLogo } from "~/components/LoadingLogo";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "~/components/ui/hover-card";
import { formatSignedPercent } from "~/lib/format";
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
  const [trendBucket, setTrendBucket] = useState<GameStatsBucketEnum>("start_time_day");
  const { data: currentData, isPending } = useQuery(gameStatsQueryOptions({ ...params, bucket: "no_bucket" }));
  const { data: prevData } = useQuery({
    ...gameStatsQueryOptions({ ...(prevParams as AnalyticsApiGameStatsRequest), bucket: "no_bucket" }),
    enabled: prevParams != null,
  });

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoadingLogo />
      </div>
    );
  }

  const current = currentData?.[0];
  if (!current) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">No data available for the selected filters.</div>
    );
  }

  const prev = prevData?.[0];
  const compareTotals = prevParams != null && totalsComparable(params, prevParams);
  const teamWinTotal = current.team0_wins + current.team1_wins;
  const prevTeamWinTotal = prev ? prev.team0_wins + prev.team1_wins : 0;
  const teamWinRow =
    teamWinTotal > 0 ? (
      <div className="flex items-center justify-between gap-3 border-b border-white/4 px-4 py-2.5 @2xl:col-span-2">
        <span className="text-sm text-muted-foreground @2xl:shrink-0">The Hidden King vs The Archmother</span>
        <div className="flex flex-wrap items-center justify-end gap-x-2.5 gap-y-1">
          <span className="text-sm font-semibold tabular-nums">
            <span className="text-primary">{((current.team0_wins / teamWinTotal) * 100).toFixed(2)}%</span>
            <span className="mx-1 text-muted-foreground">:</span>
            <span className="text-blue-400">{((current.team1_wins / teamWinTotal) * 100).toFixed(2)}%</span>
          </span>
          {prev && prevTeamWinTotal > 0 && (
            <span className="inline-flex items-center gap-0.5 rounded-md bg-white/[0.04] px-1.5 py-0.5 text-xs text-muted-foreground tabular-nums">
              <span className="text-primary">{((prev.team0_wins / prevTeamWinTotal) * 100).toFixed(2)}%</span>
              <span className="mx-0.5">:</span>
              <span className="text-blue-400">{((prev.team1_wins / prevTeamWinTotal) * 100).toFixed(2)}%</span>
            </span>
          )}
        </div>
      </div>
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
          <div
            key={category.label}
            className={cn(
              "@container overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02]",
              isWide && "lg:col-span-2",
            )}
          >
            <div className="flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.015] px-4 py-2.5">
              {Icon && <Icon className="size-4 text-primary/80" />}
              <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{category.label}</h3>
            </div>

            <div className={cn(isWide && "@2xl:grid @2xl:grid-cols-2")}>
              {stats.map((stat, statIdx) => {
                const value = current[stat.key] as number;
                const prevValue =
                  TOTAL_STATS.has(stat.key) && !compareTotals ? undefined : (prev?.[stat.key] as number | undefined);
                // Rounded to the displayed tenth of a percent so the arrow and colour agree with the printed value.
                const delta =
                  prevValue != null && prevValue !== 0
                    ? Math.round(((value - prevValue) / Math.abs(prevValue)) * 1000) / 1000
                    : null;
                const isLast = statIdx === stats.length - 1;

                return (
                  <Fragment key={stat.key}>
                    <HoverCard openDelay={150} closeDelay={100}>
                      <HoverCardTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            "flex w-full items-center justify-between px-4 py-2.5 transition-colors",
                            "border-b border-white/[0.04]",
                            !isWide && isLast && "border-b-0",
                            isWide && statIdx >= stats.length - 2 && "@2xl:border-b-0",
                            isWide && isLast && "border-b-0",
                            onStatClick && "cursor-pointer hover:bg-white/[0.04]",
                          )}
                          onClick={() => onStatClick?.(stat.key)}
                        >
                          <span className="text-left text-sm text-muted-foreground">{stat.label}</span>
                          <div className="flex items-center gap-2.5">
                            <span className="text-sm font-semibold tabular-nums">
                              {formatStatValue(value, stat.format)}
                            </span>
                            {delta != null && (
                              <span
                                className={cn(
                                  "inline-flex min-w-[52px] items-center justify-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs tabular-nums",
                                  delta > 0
                                    ? "bg-green-400/10 text-green-400"
                                    : delta < 0
                                      ? "bg-red-400/10 text-red-400"
                                      : "bg-white/[0.04] text-muted-foreground",
                                )}
                              >
                                {delta > 0 ? (
                                  <ArrowUp className="size-3" />
                                ) : delta < 0 ? (
                                  <ArrowDown className="size-3" />
                                ) : null}
                                {formatSignedPercent(delta)}
                              </span>
                            )}
                          </div>
                        </button>
                      </HoverCardTrigger>
                      <HoverCardContent className="w-[28rem] max-w-[90vw]" align="end">
                        <Suspense
                          fallback={
                            <div className="flex h-[250px] items-center justify-center">
                              <LoadingLogo />
                            </div>
                          }
                        >
                          <StatTrendChart
                            params={params}
                            stat={stat}
                            bucket={trendBucket}
                            onBucketChange={setTrendBucket}
                          />
                        </Suspense>
                      </HoverCardContent>
                    </HoverCard>
                    {stat.key === "total_players" && teamWinRow}
                  </Fragment>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
