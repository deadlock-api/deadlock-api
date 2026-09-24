import type { Rank } from "deadlock_api_client";
import type { BadgeDistribution } from "deadlock_api_client";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";

import { RANK_ICON_AXIS_HEIGHT, RankTierIcons } from "~/components/domain/rank/RankTierIcons";
import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import {
  CHART_BASELINE,
  CHART_GRID,
  CHART_TICK,
  CHART_X_AXIS,
  CHART_Y_AXIS,
  CHART_Y_LABEL,
} from "~/components/patterns/charts/theme";
import { TooltipCard, TooltipHeader, TooltipStat, TooltipStats } from "~/components/ui/tooltip";
import { niceTicks } from "~/lib/chart-axis";
import { extractBadgeMap } from "~/lib/leaderboard";
import { range } from "~/lib/utils";

export const BADGE_DISTRIBUTION_METRICS = ["players", "matches"] as const;
export type BadgeDistributionMetric = (typeof BADGE_DISTRIBUTION_METRICS)[number];

export interface BadgeDistributionChartProps {
  badgeDistributionData: BadgeDistribution[];
  ranksData: Rank[];
  metric: BadgeDistributionMetric;
}

type Metric = BadgeDistributionMetric;

export const BADGE_DISTRIBUTION_METRIC_LABEL: Record<Metric, string> = { players: "Players", matches: "Matches" };

const formatPercent = (ratio: number) => `${(ratio * 100).toFixed(1)}%`;
const compactNumber = new Intl.NumberFormat("en-US", { notation: "compact" });

interface ChartEntry {
  badge: number;
  tier: number;
  value: number;
  /** The bar's colour; Recharts reads it from the data point. */
  fill: string;
  isSpacer?: boolean;
}

export default function BadgeDistributionChart({
  badgeDistributionData,
  ranksData,
  metric,
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
        result.push({ badge: tier * 10, tier, value: 0, fill: "transparent", isSpacer: true });
      }
      const fill = tierData.get(tier)?.color ?? "var(--color-accent)";
      for (let sub = 1; sub <= 6; sub++) {
        const badge = tier * 10 + sub;
        result.push({ badge, tier, value: valuePerBadge.get(badge) ?? 0, fill });
      }
    }
    return result;
  }, [badgeDistributionData, valuePerBadge, tierData]);

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

  const ticks = useMemo(() => {
    const badges = badgeDistributionData.map((item) => item.badge_level);
    if (badges.length === 0) return [];
    const minTier = Math.floor(Math.min(...badges) / 10);
    const maxTier = Math.floor(Math.max(...badges) / 10);
    return range(minTier, maxTier + 1).map((tier) => tier * 10 + 3);
  }, [badgeDistributionData]);

  const valueTicks = useMemo(() => niceTicks(0, Math.max(0, ...chartData.map((entry) => entry.value))), [chartData]);

  // Rank names need about 64px each. Narrower (a phone), Recharts dropped every other one and the rest drifted off
  // their icons, so only the icons stay; they carry the name in their tooltip.
  const [chartWidth, setChartWidth] = useState(0);
  const showNames = ticks.length > 0 && chartWidth / ticks.length >= 64;
  const xAxisTickFormatter = (badge: number) => (showNames ? (tierData.get(Math.floor(badge / 10))?.name ?? "") : "");

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
      <ChartSurface
        label={`Rank badge distribution chart showing ${metric} per rank`}
        size="fill"
        variant="bare"
        className="min-h-0 w-full flex-1"
        onResize={setChartWidth}
      >
        <BarChart accessibilityLayer data={chartData}>
          <CartesianGrid {...CHART_GRID} />
          <Bar dataKey="value" fill="var(--color-accent)" radius={4} />
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
                <TooltipCard>
                  <TooltipHeader
                    leading={imageUrl && <img src={imageUrl} alt="" className="size-5" />}
                    title={`${rankName} ${subtier}`}
                  />
                  <TooltipStats>
                    <TooltipStat
                      label={BADGE_DISTRIBUTION_METRIC_LABEL[metric]}
                      value={entry.value.toLocaleString("en-US")}
                    />
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
                </TooltipCard>
              );
            }}
          />
          <XAxis
            {...CHART_X_AXIS}
            dataKey="badge"
            minTickGap={0}
            ticks={ticks}
            textAnchor="middle"
            tickFormatter={xAxisTickFormatter}
            dx={7}
            tickMargin={RANK_ICON_AXIS_HEIGHT + 8}
          />
          <YAxis
            {...CHART_Y_AXIS}
            dataKey="value"
            ticks={valueTicks}
            domain={[0, valueTicks[valueTicks.length - 1]]}
            tickFormatter={(value: number) => compactNumber.format(value)}
            textAnchor="end"
            // As the `label` prop, not a <Label> child: only a prop title gets room from the auto-sized axis.
            label={{ ...CHART_Y_LABEL, value: BADGE_DISTRIBUTION_METRIC_LABEL[metric] }}
          />
          {medianBadge !== undefined && (
            <ReferenceLine
              x={medianBadge}
              {...CHART_BASELINE}
              label={{ value: "Median", position: "insideTopLeft", ...CHART_TICK }}
            />
          )}
          <RankTierIcons tiers={tierCenters} ranks={tierData} />
        </BarChart>
      </ChartSurface>
    </div>
  );
}
