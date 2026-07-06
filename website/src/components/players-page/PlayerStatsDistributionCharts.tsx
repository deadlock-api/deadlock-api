import { useQuery } from "@tanstack/react-query";
import type { HashMapValue } from "deadlock_api_client";
import { Coins, Flame, HeartPulse, type LucideIcon, Swords, Wheat } from "lucide-react";
import { useMemo, useState } from "react";

import { LoadingLogo } from "~/components/LoadingLogo";
import type { GameMode } from "~/components/selectors/GameModeSelector";
import type { Dayjs } from "~/dayjs";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { playerStatsMetricsQueryOptions } from "~/queries/player-stats-metrics-query";

import { PLAYER_METRIC_CATEGORIES, PLAYER_METRICS, type PlayerMetricCategory } from "./player-metric-definitions";
import { PlayerMetricDistributionCard } from "./PlayerMetricDistributionCard";
import { PlayerMetricDistributionDialog } from "./PlayerMetricDistributionDialog";

const CATEGORY_CONFIG: Record<PlayerMetricCategory, { icon: LucideIcon; color: string }> = {
  Combat: { icon: Swords, color: "#f87171" },
  Farming: { icon: Wheat, color: "#eab308" },
  Economy: { icon: Coins, color: "#facc15" },
  Damage: { icon: Flame, color: "#fb923c" },
  Healing: { icon: HeartPulse, color: "#4ade80" },
};

export function PlayerStatsDistributionCharts({
  heroId,
  gameMode,
  minRankId,
  maxRankId,
  minDate,
  maxDate,
}: {
  heroId?: number | null;
  gameMode?: GameMode;
  minRankId?: number;
  maxRankId?: number;
  minDate?: Dayjs;
  maxDate?: Dayjs;
}) {
  const { minUnixTimestamp, maxUnixTimestamp } = useNormalizedTimeRange(minDate, maxDate);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const { data, isLoading } = useQuery(
    playerStatsMetricsQueryOptions({
      heroIds: heroId != null ? String(heroId) : undefined,
      gameMode: gameMode ?? undefined,
      minAverageBadge: minRankId,
      maxAverageBadge: maxRankId,
      minUnixTimestamp: minUnixTimestamp ?? 0,
      maxUnixTimestamp,
    }),
  );

  const groupedMetrics = useMemo(
    () =>
      PLAYER_METRIC_CATEGORIES.map((category) => ({
        category,
        metrics: PLAYER_METRICS.filter((m) => m.category === category),
      })),
    [],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <LoadingLogo />
      </div>
    );
  }

  const selectedMetric = selectedIndex != null ? PLAYER_METRICS[selectedIndex] : null;
  const step = (delta: number) =>
    setSelectedIndex((i) => (i == null ? i : (i + delta + PLAYER_METRICS.length) % PLAYER_METRICS.length));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
        <div
          className="inline-block h-2 w-4 rounded-sm bg-primary/30"
          style={{ borderTop: "1.5px solid var(--color-primary)" }}
        />
        <span>Approximate distribution shape</span>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-0.5 border-l-2 border-dashed border-primary" />
          <span>Average</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-0.5 border-l-2 border-dashed border-[#a3a3a3]" />
          <span>P25 / Median / P75</span>
        </div>
      </div>

      {groupedMetrics.map(({ category, metrics }) => {
        const config = CATEGORY_CONFIG[category];
        return (
          <div key={category} className="overflow-hidden rounded-lg border border-border">
            <div
              className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2.5"
              style={{ borderLeft: `3px solid ${config.color}` }}
            >
              <config.icon className="size-4" style={{ color: config.color }} />
              <h3 className="text-sm font-semibold text-foreground">{category}</h3>
            </div>
            <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
              {metrics.map((def) => (
                <PlayerMetricDistributionCard
                  key={def.key}
                  def={def}
                  values={data?.[def.key] as HashMapValue | undefined}
                  onExpand={() => setSelectedIndex(PLAYER_METRICS.indexOf(def))}
                />
              ))}
            </div>
          </div>
        );
      })}

      <PlayerMetricDistributionDialog
        metric={selectedMetric}
        values={selectedMetric ? (data?.[selectedMetric.key] as HashMapValue | undefined) : undefined}
        onClose={() => setSelectedIndex(null)}
        onPrev={() => step(-1)}
        onNext={() => step(1)}
      />
    </div>
  );
}
