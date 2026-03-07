import type { RankV2 } from "assets_deadlock_api_client";
import type { BadgeDistribution } from "deadlock_api_client";
import { useCallback, useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Label, Tooltip, XAxis, YAxis } from "recharts";
import { ChartContainer } from "~/components/ui/chart";
import { range } from "~/lib/utils";

export interface BadgeDistributionChartProps {
  badgeDistributionData: BadgeDistribution[];
  ranksData: RankV2[];
}

export default function BadgeDistributionChart({ badgeDistributionData, ranksData }: BadgeDistributionChartProps) {
  const tierData = useMemo(() => {
    const map = new Map<number, RankV2>();
    ranksData.forEach((r) => {
      map.set(r.tier, r);
    });
    return map;
  }, [ranksData]);

  const matchePerBadge = useMemo(() => {
    const map = new Map<number, number>();
    badgeDistributionData.forEach((item) => {
      map.set(item.badge_level, item.total_matches ?? 0);
    });
    return map;
  }, [badgeDistributionData]);

  const chartData = useMemo(() => {
    const badges = badgeDistributionData.map((item) => item.badge_level);
    if (badges.length === 0) return [];
    const [minBadge, maxBadge] = [Math.min(...badges), Math.max(...badges)];
    const minTier = Math.floor(minBadge / 10);
    const maxTier = Math.floor(maxBadge / 10);
    const result: { badge: number; tier: number; matches: number; isSpacer?: boolean }[] = [];
    for (let tier = minTier; tier <= maxTier; tier++) {
      if (tier > minTier) {
        result.push({ badge: tier * 10, tier, matches: 0, isSpacer: true });
      }
      for (let sub = 1; sub <= 6; sub++) {
        const badge = tier * 10 + sub;
        result.push({ badge, tier, matches: matchePerBadge.get(badge) ?? 0 });
      }
    }
    return result;
  }, [badgeDistributionData, matchePerBadge]);

  const ticks = useMemo(() => {
    const badges = badgeDistributionData.map((item) => item.badge_level);
    if (badges.length === 0) return [];
    const minTier = Math.floor(Math.min(...badges) / 10);
    const maxTier = Math.floor(Math.max(...badges) / 10);
    return range(minTier, maxTier + 1).map((tier) => tier * 10 + 3);
  }, [badgeDistributionData]);

  const xAxisTickFormatter = useCallback(
    (badge: number) => tierData.get(Math.floor(badge / 10))?.name ?? "",
    [tierData],
  );

  return (
    <ChartContainer config={{ matches: { label: "Matches" } }} className="h-full w-full">
      <BarChart accessibilityLayer data={chartData}>
        <CartesianGrid vertical={false} />
        <Bar dataKey="matches" fill="var(--color-accent)" radius={4}>
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
            const entry = payload[0].payload as { matches: number; tier: number; badge: number; isSpacer?: boolean };
            if (entry.isSpacer) return null;
            const rankName = tierData.get(entry.tier)?.name ?? "";
            const subtier = entry.badge % 10;
            return (
              <div className="rounded-md bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md">
                <div className="font-medium">{rankName} {subtier}</div>
                <div>{entry.matches.toLocaleString()} matches</div>
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
        />
        <YAxis dataKey="matches" tickCount={4} textAnchor="end">
          <Label value="Matches" position="middle" textAnchor={"middle"} />
        </YAxis>
      </BarChart>
    </ChartContainer>
  );
}
