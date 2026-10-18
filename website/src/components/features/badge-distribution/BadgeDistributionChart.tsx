import type { Rank } from "deadlock_api_client";
import type { BadgeDistribution } from "deadlock_api_client";
import { Bar, BarChart, CartesianGrid, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";

import { RANK_ICON_NAME_AXIS_HEIGHT, RankTierIcons } from "~/components/domain/rank/RankTierIcons";
import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import {
  CHART_BASELINE,
  CHART_CURSOR_BAND,
  CHART_GRID,
  CHART_TICK,
  CHART_X_AXIS,
  CHART_Y_AXIS,
  CHART_Y_LABEL,
  CHART_COLOR,
  chartMarkColor,
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
  /** Where the bar sits on the x axis: its tier's six subtiers, then one empty slot before the next tier. */
  x: number;
  value: number;
  /** The bar's colour; Recharts reads it from the data point. */
  fill: string;
}

/**
 * The bar's place on the numeric x axis. Seven slots a tier leave an empty one between tiers, so the tiers stand
 * apart without blank data points, which the arrow keys would stop on.
 */
const slotOf = (tier: number, subtier: number) => tier * 7 + subtier;

/** The entry at which half of the selected metric sits at or below it. */
function medianEntryOf(chartData: ChartEntry[], total: number): ChartEntry | undefined {
  let running = 0;
  for (const entry of chartData) {
    running += entry.value;
    if (running >= total / 2) return entry;
  }
  return undefined;
}

export default function BadgeDistributionChart({
  badgeDistributionData,
  ranksData,
  metric,
}: BadgeDistributionChartProps) {
  const tierData = new Map(ranksData.map((rank) => [rank.tier, rank]));
  const badgeMap = extractBadgeMap(ranksData);
  const valuePerBadge = new Map(
    badgeDistributionData.map((item) => [
      item.badge_level,
      (metric === "players" ? item.unique_players : item.total_matches) ?? 0,
    ]),
  );

  // Every tier from the lowest to the highest badge in the data, gaps included.
  const badges = badgeDistributionData.map((item) => item.badge_level);
  const tiers =
    badges.length === 0 ? [] : range(Math.floor(Math.min(...badges) / 10), Math.floor(Math.max(...badges) / 10) + 1);

  const chartData: ChartEntry[] = [];
  for (const tier of tiers) {
    // Lifted to the mark lightness floor: Initiate and Seeker, the tallest bars, were about 2.3:1 on the surface.
    const fill = chartMarkColor(tierData.get(tier)?.color);
    for (let sub = 1; sub <= 6; sub++) {
      const badge = tier * 10 + sub;
      chartData.push({ badge, tier, x: slotOf(tier, sub), value: valuePerBadge.get(badge) ?? 0, fill });
    }
  }
  const slots = chartData.map((entry) => entry.x);

  const total = chartData.reduce((sum, entry) => sum + entry.value, 0);
  const atOrAbove = new Map<number, number>();
  let aboveSum = 0;
  for (const entry of chartData.toReversed()) {
    aboveSum += entry.value;
    atOrAbove.set(entry.badge, aboveSum);
  }

  const median = medianEntryOf(chartData, total);

  const valueTicks = niceTicks(0, Math.max(0, ...chartData.map((entry) => entry.value)));

  const tierCenters = tiers.map((tier) => ({ tier, firstBadge: slotOf(tier, 1), lastBadge: slotOf(tier, 6) }));

  return (
    <div className="flex h-full w-full flex-col">
      <ChartSurface
        label={`Rank badge distribution chart showing ${metric} per rank`}
        size="fill"
        variant="bare"
        className="min-h-0 w-full flex-1"
      >
        <BarChart accessibilityLayer data={chartData}>
          <CartesianGrid {...CHART_GRID} />
          <Bar dataKey="value" fill={CHART_COLOR.fallback} radius={4} />
          <Tooltip
            // The column under the reading, by mouse or arrow keys, so the bar being read is marked.
            cursor={CHART_CURSOR_BAND}
            isAnimationActive={false}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const entry = payload[0].payload as ChartEntry;
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
                    {total > 0 && (
                      <>
                        <TooltipStat label={`Share of ${metric}`} value={formatPercent(entry.value / total)} />
                        <TooltipStat label="Top" value={formatPercent((atOrAbove.get(entry.badge) ?? 0) / total)} />
                      </>
                    )}
                  </TooltipStats>
                </TooltipCard>
              );
            }}
          />
          {/* The rank names are drawn by RankTierIcons, centred under each tier's badge. */}
          {/* Numeric, with a tick per bar: Recharts sizes the bars from the distance between ticks. */}
          <XAxis
            {...CHART_X_AXIS}
            type="number"
            dataKey="x"
            domain={[Math.min(...slots) - 0.5, Math.max(...slots) + 0.5]}
            ticks={slots}
            interval={0}
            tick={false}
            height={RANK_ICON_NAME_AXIS_HEIGHT}
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
          {median !== undefined && (
            <ReferenceLine
              x={median.x}
              {...CHART_BASELINE}
              label={{ value: "Median", position: "insideTopLeft", ...CHART_TICK }}
            />
          )}
          <RankTierIcons tiers={tierCenters} ranks={tierData} display="icon-name" />
        </BarChart>
      </ChartSurface>
    </div>
  );
}
