import type { Rank } from "deadlock_api_client";
import type { BadgeDistribution } from "deadlock_api_client";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Customized, Label, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";

import { RANK_ICON_AXIS_HEIGHT, RankTierIcons } from "~/components/domain/rank/RankTierIcons";
import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import { CHART_AXIS, CHART_BASELINE, CHART_GRID, CHART_TICK } from "~/components/patterns/charts/theme";
import { PanelTooltipCard, TooltipHeader, TooltipStat, TooltipStats } from "~/components/ui/panel-tooltip";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { niceTicks } from "~/lib/chart-axis";
import { extractBadgeMap } from "~/lib/leaderboard";
import { range } from "~/lib/utils";

export const BADGE_DISTRIBUTION_METRICS = ["players", "matches"] as const;
export type BadgeDistributionMetric = (typeof BADGE_DISTRIBUTION_METRICS)[number];

export interface BadgeDistributionChartProps {
  badgeDistributionData: BadgeDistribution[];
  ranksData: Rank[];
  metric: BadgeDistributionMetric;
  onMetricChange: (metric: BadgeDistributionMetric) => void;
}

type Metric = BadgeDistributionMetric;

const METRIC_LABEL: Record<Metric, string> = { players: "Players", matches: "Matches" };

const formatPercent = (ratio: number) => `${(ratio * 100).toFixed(1)}%`;
const compactNumber = new Intl.NumberFormat("en-US", { notation: "compact" });

interface ChartEntry {
  badge: number;
  tier: number;
  value: number;
  isSpacer?: boolean;
}

export default function BadgeDistributionChart({
  badgeDistributionData,
  ranksData,
  metric,
  onMetricChange,
}: BadgeDistributionChartProps) {
  const tierData = useMemo(() => {
    const map = new Map<number, Rank>();
    ranksData.forEach((r) => {
      map.set(r.tier, r);
    });
    return map;
  }, [ranksData]);

  const badgeMap = useMemo(() => extractBadgeMap(ranksData), [ranksData]);

  const valuePerBadge = useMemo(() => {
    const map = new Map<number, number>();
    badgeDistributionData.forEach((item) => {
      map.set(item.badge_level, (metric === "players" ? item.unique_players : item.total_matches) ?? 0);
    });
    return map;
  }, [badgeDistributionData, metric]);

  const chartData = useMemo(() => {
    const badges = badgeDistributionData.map((item) => item.badge_level);
    if (badges.length === 0) return [];
    const [minBadge, maxBadge] = [Math.min(...badges), Math.max(...badges)];
    const minTier = Math.floor(minBadge / 10);
    const maxTier = Math.floor(maxBadge / 10);
    const result: ChartEntry[] = [];
    for (let tier = minTier; tier <= maxTier; tier++) {
      if (tier > minTier) {
        result.push({ badge: tier * 10, tier, value: 0, isSpacer: true });
      }
      for (let sub = 1; sub <= 6; sub++) {
        const badge = tier * 10 + sub;
        result.push({ badge, tier, value: valuePerBadge.get(badge) ?? 0 });
      }
    }
    return result;
  }, [badgeDistributionData, valuePerBadge]);

  const shares = useMemo(() => {
    const total = chartData.reduce((sum, entry) => sum + entry.value, 0);
    const atOrAbove = new Map<number, number>();
    let running = 0;
    for (const entry of chartData.toReversed()) {
      running += entry.value;
      atOrAbove.set(entry.badge, running);
    }
    return { total, atOrAbove };
  }, [chartData]);

  // The badge at which half of the selected metric sits at or below it.
  const medianBadge = useMemo(() => {
    let running = 0;
    for (const entry of chartData) {
      running += entry.value;
      if (!entry.isSpacer && running >= shares.total / 2) return entry.badge;
    }
    return undefined;
  }, [chartData, shares.total]);
  const medianInfo = medianBadge === undefined ? undefined : badgeMap.get(medianBadge);

  const ticks = useMemo(() => {
    const badges = badgeDistributionData.map((item) => item.badge_level);
    if (badges.length === 0) return [];
    const minTier = Math.floor(Math.min(...badges) / 10);
    const maxTier = Math.floor(Math.max(...badges) / 10);
    return range(minTier, maxTier + 1).map((tier) => tier * 10 + 3);
  }, [badgeDistributionData]);

  const valueTicks = useMemo(() => niceTicks(0, Math.max(0, ...chartData.map((entry) => entry.value))), [chartData]);

  const xAxisTickFormatter = (badge: number) => tierData.get(Math.floor(badge / 10))?.name ?? "";

  const tierCenters = useMemo(() => {
    const badges = badgeDistributionData.map((item) => item.badge_level);
    if (badges.length === 0) return [];
    const minTier = Math.floor(Math.min(...badges) / 10);
    const maxTier = Math.floor(Math.max(...badges) / 10);
    return range(minTier, maxTier + 1).map((tier) => ({
      tier,
      firstBadge: tier * 10 + 1,
      lastBadge: tier * 10 + 6,
    }));
  }, [badgeDistributionData]);

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {medianInfo ? (
            <>
              Median {metric === "players" ? "player" : "match"} rank:{" "}
              <span className="font-medium text-foreground">
                {medianInfo.name} {medianInfo.subtier}
              </span>
            </>
          ) : null}
        </p>
        <Segmented aria-label="Metric" width="hug" value={metric} onValueChange={onMetricChange}>
          {BADGE_DISTRIBUTION_METRICS.map((value) => (
            <SegmentedItem key={value} value={value}>
              {METRIC_LABEL[value]}
            </SegmentedItem>
          ))}
        </Segmented>
      </div>
      <ChartSurface
        label={`Rank badge distribution chart showing ${metric} per rank`}
        size="fill"
        variant="bare"
        className="min-h-0 w-full flex-1"
      >
        <BarChart accessibilityLayer data={chartData}>
          <CartesianGrid {...CHART_GRID} />
          <Bar dataKey="value" fill="var(--color-accent)" radius={4}>
            {chartData.map((entry) => (
              <Cell
                key={`cell-${entry.badge}`}
                fill={entry.isSpacer ? "transparent" : (tierData.get(entry.tier)?.color ?? "var(--color-accent)")}
              />
            ))}
          </Bar>
          <Tooltip
            cursor={false}
            isAnimationActive={false}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const entry = payload[0].payload as ChartEntry;
              if (entry.isSpacer) return null;
              const rankName = tierData.get(entry.tier)?.name ?? "";
              const subtier = entry.badge % 10;
              const info = badgeMap.get(entry.badge);
              const imageUrl = info?.large_webp ?? info?.large;
              return (
                <PanelTooltipCard>
                  <TooltipHeader
                    lead={imageUrl && <img src={imageUrl} alt="" className="size-5" />}
                    title={`${rankName} ${subtier}`}
                  />
                  <TooltipStats>
                    <TooltipStat label={METRIC_LABEL[metric]} value={entry.value.toLocaleString("en-US")} />
                    {shares.total > 0 && (
                      <>
                        <TooltipStat label={`Share of ${metric}`} value={formatPercent(entry.value / shares.total)} />
                        <TooltipStat
                          label="Top"
                          value={formatPercent((shares.atOrAbove.get(entry.badge) ?? 0) / shares.total)}
                        />
                      </>
                    )}
                  </TooltipStats>
                </PanelTooltipCard>
              );
            }}
          />
          <XAxis
            {...CHART_AXIS}
            dataKey="badge"
            minTickGap={0}
            ticks={ticks}
            textAnchor="middle"
            tickFormatter={xAxisTickFormatter}
            dx={7}
            height={RANK_ICON_AXIS_HEIGHT + 32}
            tickMargin={RANK_ICON_AXIS_HEIGHT + 8}
          />
          <YAxis
            {...CHART_AXIS}
            dataKey="value"
            ticks={valueTicks}
            domain={[0, valueTicks[valueTicks.length - 1]]}
            tickFormatter={(value: number) => compactNumber.format(value)}
            textAnchor="end"
          >
            <Label value={METRIC_LABEL[metric]} position="middle" textAnchor="middle" />
          </YAxis>
          {medianBadge !== undefined && (
            <ReferenceLine
              x={medianBadge}
              {...CHART_BASELINE}
              label={{ value: "Median", position: "insideTopLeft", ...CHART_TICK }}
            />
          )}
          <Customized component={<RankTierIcons tiers={tierCenters} ranks={tierData} />} />
        </BarChart>
      </ChartSurface>
    </div>
  );
}
