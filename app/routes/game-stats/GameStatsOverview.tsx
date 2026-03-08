import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp } from "lucide-react";
import { LoadingLogo } from "~/components/LoadingLogo";
import type { GameStatsParams } from "~/lib/game-stats-api";
import { gameStatsQueryOptions } from "~/queries/game-stats-query";
import { GAME_STAT_CATEGORIES, formatStatValue } from "./stat-definitions";

interface GameStatsOverviewProps {
  params: GameStatsParams;
  prevParams: GameStatsParams | null;
}

export default function GameStatsOverview({ params, prevParams }: GameStatsOverviewProps) {
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
    <div className="space-y-6">
      {GAME_STAT_CATEGORIES.map((category) => (
        <div key={category.label}>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">{category.label}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {category.stats.map((stat) => {
              const value = current[stat.key] as number;
              const prevValue = prev?.[stat.key] as number | undefined;
              const delta = prevValue != null && prevValue !== 0 ? (value - prevValue) / Math.abs(prevValue) : null;

              return (
                <div
                  key={stat.key}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 space-y-1"
                >
                  <div className="text-xs text-muted-foreground">{stat.label}</div>
                  <div className="text-xl font-semibold tabular-nums">{formatStatValue(value, stat.format)}</div>
                  {delta != null && (
                    <div className={`flex items-center gap-1 text-xs ${delta > 0 ? "text-green-400" : delta < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                      {delta > 0 ? <ArrowUp className="size-3" /> : delta < 0 ? <ArrowDown className="size-3" /> : null}
                      <span>{delta > 0 ? "+" : ""}{(delta * 100).toFixed(1)}%</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
