import { useQuery } from "@tanstack/react-query";
import type { HashMapValue } from "deadlock_api_client";
import { ChartArea, Coins, Flame, HeartPulse, Sparkles, Swords, type LucideIcon, Wheat } from "lucide-react";
import { useMemo, useState } from "react";

import { ChartLegend, ChartLegendItem } from "~/components/patterns/charts/ChartLegend";
import { CHART_COLOR } from "~/components/patterns/charts/theme";
import { Disclosure } from "~/components/patterns/content/Disclosure";
import { FilterBar } from "~/components/patterns/filter-bar/FilterBar";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Text } from "~/components/ui/text";
import type { Dayjs } from "~/dayjs";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { BUFF_TIMINGS_NOTE } from "~/lib/buffs";
import type { GameMode, MatchMode } from "~/lib/game-mode";
import {
  PLAYER_BUFF_METRICS,
  PLAYER_METRIC_CATEGORIES,
  PLAYER_METRICS,
  type PlayerMetricCategory,
  type PlayerMetricDefinition,
} from "~/lib/player-metrics";
import { playerStatsMetricsQueryOptions } from "~/queries/player-stats-metrics-query";

import { PlayerMetricDistributionCard } from "./PlayerMetricDistributionCard";
import { PlayerMetricDistributionDialog } from "./PlayerMetricDistributionDialog";

const CATEGORY_ICON: Record<PlayerMetricCategory, LucideIcon> = {
  Combat: Swords,
  Farming: Wheat,
  Economy: Coins,
  Damage: Flame,
  Healing: HeartPulse,
  "Permanent Buffs": Sparkles,
};

const ALL_METRICS: PlayerMetricDefinition[] = [...PLAYER_METRICS, ...PLAYER_BUFF_METRICS];
const BUFF_KEYS = new Set(PLAYER_BUFF_METRICS.map((metric) => metric.key));

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

  const params = {
    heroIds: heroId != null ? String(heroId) : undefined,
    gameMode: gameMode ?? undefined,
    matchMode,
    minAverageBadge: minRankId,
    maxAverageBadge: maxRankId,
    minUnixTimestamp: minUnixTimestamp ?? 0,
    maxUnixTimestamp,
  };
  const { data, isLoading, isError, refetch } = useQuery(playerStatsMetricsQueryOptions(params));
  const selectedMetric = selectedIndex != null ? ALL_METRICS[selectedIndex] : null;
  // The buff metrics cost a second, heavier request, made once their section or one of their charts is open.
  const buffsShown =
    openCategories.has("Permanent Buffs") || (selectedMetric != null && BUFF_KEYS.has(selectedMetric.key));
  const buffQuery = useQuery({
    ...playerStatsMetricsQueryOptions({ ...params, includeBuffMetrics: true }),
    enabled: buffsShown,
  });
  /** A metric's distribution; one the filtered matches never recorded (a pickup time before the update) is missing. */
  const valuesOf = (metric: PlayerMetricDefinition): HashMapValue | undefined => {
    const values = (BUFF_KEYS.has(metric.key) ? buffQuery.data : data)?.[metric.key];
    return values?.avg == null ? undefined : values;
  };

  const groupedMetrics = useMemo(
    () =>
      PLAYER_METRIC_CATEGORIES.map((category) => ({
        category,
        metrics: ALL_METRICS.filter((m) => m.category === category),
      })),
    [],
  );

  if (isLoading) {
    return <LoadingState label="player stat distributions" align="center" />;
  }

  if (isError && !data) {
    return <ErrorState title="Player stat distributions did not load" onRetry={() => void refetch()} />;
  }

  const step = (delta: number) =>
    setSelectedIndex((i) => (i == null ? i : (i + delta + ALL_METRICS.length) % ALL_METRICS.length));

  return (
    <div className="flex flex-col gap-6">
      <FilterBar variant="toolbar" title="Stat distributions" icon={ChartArea} aria-label="Stat distribution legend">
        <ChartLegend>
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
      </FilterBar>

      <div className="flex flex-col gap-3">
        {groupedMetrics.map(({ category, metrics }) => {
          const Icon = CATEGORY_ICON[category];
          const open = openCategories.has(category);
          const isBuffs = category === "Permanent Buffs";
          return (
            <Disclosure
              key={category}
              variant="bordered"
              size="lg"
              icon={<Icon aria-hidden="true" className="text-muted-foreground" />}
              title={category}
              open={open}
              onOpenChange={(next) => setCategoryOpen(category, next)}
            >
              {/* Rendered only when open: a chart in a closed <details> would measure itself at zero size. */}
              {!open ? null : isBuffs && buffQuery.isPending ? (
                <LoadingState label="buff distributions" align="center" />
              ) : isBuffs && buffQuery.isError && !buffQuery.data ? (
                <ErrorState
                  title="Buff distributions did not load"
                  retrying={buffQuery.isFetching}
                  onRetry={() => void buffQuery.refetch()}
                />
              ) : (
                <div className="@container flex flex-col gap-3">
                  {isBuffs && (
                    <Text variant="caption" tone="muted">
                      Golden statue pickups per match. {BUFF_TIMINGS_NOTE}
                    </Text>
                  )}
                  <div className="grid grid-cols-1 gap-3 @[18rem]:grid-cols-2 @[52rem]:grid-cols-4">
                    {metrics.map((def) => (
                      <PlayerMetricDistributionCard
                        key={def.key}
                        def={def}
                        values={valuesOf(def)}
                        onExpand={() => setSelectedIndex(ALL_METRICS.indexOf(def))}
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
        values={selectedMetric ? valuesOf(selectedMetric) : undefined}
        onClose={() => setSelectedIndex(null)}
        onPrev={() => step(-1)}
        onNext={() => step(1)}
      />
    </div>
  );
}
