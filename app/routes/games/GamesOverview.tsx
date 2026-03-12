import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowDown, ArrowUp } from "lucide-react";

import { LoadingLogo } from "~/components/LoadingLogo";
import { cn } from "~/lib/utils";
import type { AnalyticsApiGameStatsRequest } from "deadlock_api_client/api";
import { gameStatsQueryOptions } from "~/queries/games-query";

import { CATEGORY_ICONS, formatStatValue, getFilteredCategories } from "./stat-definitions";

interface GamesOverviewProps {
  params: AnalyticsApiGameStatsRequest;
  prevParams: AnalyticsApiGameStatsRequest | null;
  onStatClick?: (statKey: string) => void;
  isStreetBrawl?: boolean;
}

export default function GamesOverview({ params, prevParams, onStatClick, isStreetBrawl = false }: GamesOverviewProps) {
  const { data: currentData, isPending } = useQuery(gameStatsQueryOptions({ ...params, bucket: "no_bucket" }));
  const { data: prevData } = useQuery({
    ...gameStatsQueryOptions({ ...prevParams!, bucket: "no_bucket" }),
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

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {getFilteredCategories(isStreetBrawl).map((category, catIdx) => {
        const Icon = CATEGORY_ICONS[category.label];
        const isWide = category.stats.length > 6;

        return (
          <motion.div
            key={category.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: catIdx * 0.06 }}
            className={cn(
              "overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02]",
              isWide && "lg:col-span-2",
            )}
          >
            <div className="flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.015] px-4 py-2.5">
              {Icon && <Icon className="size-4 text-primary/80" />}
              <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{category.label}</h3>
            </div>

            <div className={cn(isWide && "sm:grid sm:grid-cols-2")}>
              {category.stats.map((stat, statIdx) => {
                const value = current[stat.key] as number;
                const prevValue = prev?.[stat.key] as number | undefined;
                const delta = prevValue != null && prevValue !== 0 ? (value - prevValue) / Math.abs(prevValue) : null;
                const isLast = statIdx === category.stats.length - 1;

                const teamWinRow =
                  stat.key === "total_matches" && current.team0_wins + current.team1_wins > 0
                    ? (() => {
                        const total = current.team0_wins + current.team1_wins;
                        const t0Pct = (current.team0_wins / total) * 100;
                        const t1Pct = (current.team1_wins / total) * 100;
                        const prevTotal = prev ? prev.team0_wins + prev.team1_wins : 0;
                        const prevT0Pct = prevTotal > 0 ? (prev!.team0_wins / prevTotal) * 100 : null;
                        const prevT1Pct = prevTotal > 0 ? (prev!.team1_wins / prevTotal) * 100 : null;
                        return (
                          <div className="flex items-center justify-between border-b border-white/4 px-4 py-2.5">
                            <span className="text-sm text-muted-foreground">The Hidden King vs The Archmother</span>
                            <div className="flex items-center gap-2.5">
                              <span className="text-sm font-semibold tabular-nums">
                                <span className="text-primary">{t0Pct.toFixed(2)}%</span>
                                <span className="mx-1 text-muted-foreground">:</span>
                                <span className="text-blue-400">{t1Pct.toFixed(2)}%</span>
                              </span>
                              {prevT0Pct != null && prevT1Pct != null && (
                                <span className="inline-flex items-center gap-0.5 rounded-md bg-white/[0.04] px-1.5 py-0.5 text-xs text-muted-foreground tabular-nums">
                                  <span className="text-primary">{prevT0Pct.toFixed(2)}%</span>
                                  <span className="mx-0.5">:</span>
                                  <span className="text-blue-400">{prevT1Pct.toFixed(2)}%</span>
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })()
                    : null;

                return (
                  <div key={stat.key}>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.2, delay: catIdx * 0.06 + statIdx * 0.02 }}
                      className={cn(
                        "flex items-center justify-between px-4 py-2.5 transition-colors",
                        "border-b border-white/[0.04]",
                        !isWide && isLast && !teamWinRow && "border-b-0",
                        isWide && statIdx >= category.stats.length - 2 && "sm:border-b-0",
                        isWide && isLast && "border-b-0",
                        onStatClick && "cursor-pointer hover:bg-white/[0.04]",
                      )}
                      onClick={() => onStatClick?.(stat.key)}
                    >
                      <span className="text-sm text-muted-foreground">{stat.label}</span>
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
                            {delta > 0 ? "+" : ""}
                            {(delta * 100).toFixed(1)}%
                          </span>
                        )}
                      </div>
                    </motion.div>
                    {teamWinRow}
                  </div>
                );
              })}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
