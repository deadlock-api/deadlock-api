import type { Rank } from "deadlock_api_client";
import type { BadgeDistribution } from "deadlock_api_client";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Customized, Label, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";

import { RankTierIcons } from "~/components/RankTierIcons";
import { ChartContainer } from "~/components/ui/chart";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
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
        <ToggleGroup
          type="single"
          aria-label="Metric"
          value={metric}
          onValueChange={(v) => v && onMetricChange(v as Metric)}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="players" className="px-6">
            Players
          </ToggleGroupItem>
          <ToggleGroupItem value="matches" className="px-6">
            Matches
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
        role="img"
        aria-label={`Rank badge distribution chart showing ${metric} per rank`}
        className="min-h-0 w-full flex-1"
      >
        <ChartContainer config={{ value: { label: METRIC_LABEL[metric] } }} className="h-full w-full">
          <BarChart accessibilityLayer data={chartData}>
            <CartesianGrid vertical={false} />
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
                  <div className="flex items-center gap-2 rounded-md bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md">
                    {imageUrl && <img src={imageUrl} alt={`${rankName} ${subtier}`} className="size-5" />}
                    <div>
                      <div className="font-medium">
                        {rankName} {subtier}
                      </div>
                      <div>
                        {entry.value.toLocaleString("en-US")} {metric}
                      </div>
                      {shares.total > 0 && (
                        <div className="text-xs text-muted-foreground">
                          {formatPercent(entry.value / shares.total)} of {metric}, top{" "}
                          {formatPercent((shares.atOrAbove.get(entry.badge) ?? 0) / shares.total)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }}
            />
            <XAxis
              dataKey="badge"
              tickLine={false}
              minTickGap={0}
              ticks={ticks}
              textAnchor="middle"
              tickFormatter={xAxisTickFormatter}
              dx={7}
            />
            <YAxis dataKey="value" tickCount={4} textAnchor="end">
              <Label value={METRIC_LABEL[metric]} position="middle" textAnchor="middle" />
            </YAxis>
            {medianBadge !== undefined && (
              <ReferenceLine
                x={medianBadge}
                stroke="var(--color-foreground)"
                strokeDasharray="4 4"
                strokeOpacity={0.6}
                label={{
                  value: "Median",
                  position: "insideTopLeft",
                  fill: "var(--color-muted-foreground)",
                  fontSize: 12,
                }}
              />
            )}
            <Customized component={<RankTierIcons tiers={tierCenters} ranks={tierData} />} />
          </BarChart>
        </ChartContainer>
      </div>
    </div>
  );
}
