import { useQuery } from "@tanstack/react-query";
import type { HashMapValue } from "deadlock_api_client";
import { Coins, Flame, HeartPulse, type LucideIcon, Swords, Wheat } from "lucide-react";
import { useMemo, useState } from "react";

import { ChartLegend, ChartLegendItem } from "~/components/patterns/charts/ChartLegend";
import { CHART_COLOR } from "~/components/patterns/charts/theme";
import { Disclosure } from "~/components/patterns/content/Disclosure";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Text } from "~/components/ui/text";
import type { Dayjs } from "~/dayjs";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import type { GameMode, MatchMode } from "~/lib/game-mode";
import { PLAYER_METRIC_CATEGORIES, PLAYER_METRICS, type PlayerMetricCategory } from "~/lib/player-metrics";
import { playerStatsMetricsQueryOptions } from "~/queries/player-stats-metrics-query";

import { PlayerMetricDistributionCard } from "./PlayerMetricDistributionCard";
import { PlayerMetricDistributionDialog } from "./PlayerMetricDistributionDialog";

const CATEGORY_ICON: Record<PlayerMetricCategory, LucideIcon> = {
  Combat: Swords,
  Farming: Wheat,
  Economy: Coins,
  Damage: Flame,
  Healing: HeartPulse,
};

/** Open on arrival. Every chart at once ran to 6,600px on a phone; the rest open on demand. */
const DEFAULT_OPEN: PlayerMetricCategory[] = ["Combat"];

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
  const [openCategories, setOpenCategories] = useState<ReadonlySet<PlayerMetricCategory>>(() => new Set(DEFAULT_OPEN));
  const setCategoryOpen = (category: PlayerMetricCategory, open: boolean) =>
    setOpenCategories((current) => {
      const next = new Set(current);
      if (open) next.add(category);
      else next.delete(category);
      return next;
    });

  const { data, isLoading, isError, refetch } = useQuery(
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

  if (isError && !data) {
    return <ErrorState title="Player stat distributions did not load" onRetry={() => void refetch()} />;
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

      <div className="flex flex-col gap-3">
        {groupedMetrics.map(({ category, metrics }) => {
          const Icon = CATEGORY_ICON[category];
          const open = openCategories.has(category);
          return (
            <Disclosure
              key={category}
              variant="bordered"
              size="lg"
              icon={<Icon aria-hidden="true" className="text-muted-foreground" />}
              title={
                <>
                  {category}{" "}
                  <Text variant="meta" tone="muted" numeric="tabular">
                    {metrics.length} stats
                  </Text>
                </>
              }
              open={open}
              onOpenChange={(next) => setCategoryOpen(category, next)}
            >
              {/* Rendered only when open: a chart in a closed <details> would measure itself at zero size. */}
              {open && (
                <div className="@container">
                  <div className="grid grid-cols-1 gap-3 @[18rem]:grid-cols-2 @[52rem]:grid-cols-4">
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
              )}
            </Disclosure>
          );
        })}
      </div>

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
