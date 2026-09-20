import { useQuery } from "@tanstack/react-query";
import type { HashMapValue } from "deadlock_api_client";
import { Coins, Flame, HeartPulse, type LucideIcon, Swords, Wheat } from "lucide-react";
import { useMemo, useState } from "react";

import type { GameMode } from "~/components/domain/selectors/GameModeSelector";
import type { MatchMode } from "~/components/domain/selectors/MatchModeSelector";
import { ChartLegend, ChartLegendItem } from "~/components/patterns/charts/ChartLegend";
import { CHART_COLOR, SERIES_COLORS } from "~/components/patterns/charts/theme";
import { Panel, PanelHeader } from "~/components/patterns/panel/Panel";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import type { Dayjs } from "~/dayjs";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { PLAYER_METRIC_CATEGORIES, PLAYER_METRICS, type PlayerMetricCategory } from "~/lib/player-metrics";
import { playerStatsMetricsQueryOptions } from "~/queries/player-stats-metrics-query";

import { PlayerMetricDistributionCard } from "./PlayerMetricDistributionCard";
import { PlayerMetricDistributionDialog } from "./PlayerMetricDistributionDialog";

const CATEGORY_CONFIG: Record<PlayerMetricCategory, { icon: LucideIcon; color: string }> = {
  Combat: { icon: Swords, color: SERIES_COLORS[0] },
  Farming: { icon: Wheat, color: SERIES_COLORS[2] },
  Economy: { icon: Coins, color: SERIES_COLORS[3] },
  Damage: { icon: Flame, color: SERIES_COLORS[4] },
  Healing: { icon: HeartPulse, color: SERIES_COLORS[1] },
};

export function PlayerStatsDistributionCharts({
  heroId,
  gameMode,
  matchMode,
  minRankId,
  maxRankId,
  minDate,
  maxDate,
}: {
  heroId?: number | null;
  gameMode?: GameMode;
  matchMode?: MatchMode;
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
      matchMode,
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
    return <LoadingState label="player stat distributions" align="center" />;
  }

  const selectedMetric = selectedIndex != null ? PLAYER_METRICS[selectedIndex] : null;
  const step = (delta: number) =>
    setSelectedIndex((i) => (i == null ? i : (i + delta + PLAYER_METRICS.length) % PLAYER_METRICS.length));

  return (
    <div className="flex flex-col gap-6">
      <ChartLegend className="justify-center">
        <ChartLegendItem color={CHART_COLOR.primary} shape="square">
          Approximate distribution shape
        </ChartLegendItem>
        <ChartLegendItem color={CHART_COLOR.primary} shape="line">
          Average
        </ChartLegendItem>
        <ChartLegendItem color={CHART_COLOR.neutral} shape="line">
          P25 / Median / P75
        </ChartLegendItem>
      </ChartLegend>

      {groupedMetrics.map(({ category, metrics }) => {
        const config = CATEGORY_CONFIG[category];
        return (
          <Panel key={category}>
            <PanelHeader title={category} icon={config.icon} accent={config.color} />
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
          </Panel>
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
