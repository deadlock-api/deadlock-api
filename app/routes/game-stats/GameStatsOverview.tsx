import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Coins,
  Flame,
  Swords,
  Wheat,
  type LucideIcon,
} from "lucide-react";
import { LoadingLogo } from "~/components/LoadingLogo";
import type { GameStatsParams } from "~/lib/game-stats-api";
import { cn } from "~/lib/utils";
import { gameStatsQueryOptions } from "~/queries/game-stats-query";
import { formatStatValue, getFilteredCategories } from "./stat-definitions";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "Match Flow": Activity,
  Combat: Swords,
  Damage: Flame,
  Economy: Coins,
  Farming: Wheat,
};

interface GameStatsOverviewProps {
  params: GameStatsParams;
  prevParams: GameStatsParams | null;
  onStatClick?: (statKey: string) => void;
  isStreetBrawl?: boolean;
}

export default function GameStatsOverview({ params, prevParams, onStatClick, isStreetBrawl = false }: GameStatsOverviewProps) {
  const { data: currentData, isPending } = useQuery(
    gameStatsQueryOptions({ ...params, bucket: "no_bucket" }),
  );
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
    return <div className="text-center text-sm text-muted-foreground py-8">No data available for the selected filters.</div>;
  }

  const prev = prevData?.[0];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
              "rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden",
              isWide && "lg:col-span-2",
            )}
          >
            <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-2 bg-white/[0.015]">
              {Icon && <Icon className="size-4 text-primary/80" />}
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {category.label}
              </h3>
            </div>

            <div className={cn(isWide && "sm:grid sm:grid-cols-2")}>
              {category.stats.map((stat, statIdx) => {
                const value = current[stat.key] as number;
                const prevValue = prev?.[stat.key] as number | undefined;
                const delta = prevValue != null && prevValue !== 0 ? (value - prevValue) / Math.abs(prevValue) : null;

                return (
                  <motion.div
                    key={stat.key}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2, delay: catIdx * 0.06 + statIdx * 0.02 }}
                    className={cn(
                      "flex items-center justify-between px-4 py-2.5 transition-colors",
                      "border-b border-white/[0.04]",
                      !isWide && statIdx === category.stats.length - 1 && "border-b-0",
                      isWide && statIdx >= category.stats.length - 2 && "sm:border-b-0",
                      isWide && statIdx === category.stats.length - 1 && "border-b-0",
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
                            "inline-flex items-center gap-0.5 text-xs tabular-nums px-1.5 py-0.5 rounded-md min-w-[52px] justify-center",
                            delta > 0
                              ? "text-green-400 bg-green-400/10"
                              : delta < 0
                                ? "text-red-400 bg-red-400/10"
                                : "text-muted-foreground bg-white/[0.04]",
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
                );
              })}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
