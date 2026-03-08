import type { RankV2 } from "assets_deadlock_api_client";
import type { BadgeDistribution } from "deadlock_api_client";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Customized,
  Label,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer } from "~/components/ui/chart";
import { extractBadgeMap } from "~/lib/leaderboard";
import { range } from "~/lib/utils";

export interface BadgeDistributionChartProps {
  badgeDistributionData: BadgeDistribution[];
  ranksData: RankV2[];
}

interface ChartEntry {
  badge: number;
  tier: number;
  matches: number;
  isSpacer?: boolean;
}

export default function BadgeDistributionChart({
  badgeDistributionData,
  ranksData,
}: BadgeDistributionChartProps) {
  const tierData = useMemo(() => {
    const map = new Map<number, RankV2>();
    ranksData.forEach((r) => {
      map.set(r.tier, r);
    });
    return map;
  }, [ranksData]);

  const badgeMap = useMemo(() => extractBadgeMap(ranksData), [ranksData]);

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
    const result: ChartEntry[] = [];
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

  const xAxisTickFormatter = (badge: number) =>
    tierData.get(Math.floor(badge / 10))?.name ?? "";

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

  const RankIconsOverlay = useMemo(() => {
    return function RankIcons(props: Record<string, unknown>) {
      const xAxisMap = props.xAxisMap as
        | Record<
            string,
            { scale: (v: number) => number | undefined; bandSize?: number }
          >
        | undefined;
      const offset = props.offset as
        | { top: number; height: number }
        | undefined;
      if (!xAxisMap || !offset) return null;

      const xAxis = Object.values(xAxisMap)[0];
      const scale = xAxis?.scale;
      const bandwidth = xAxis?.bandSize ?? 0;
      if (!scale) return null;

      const iconSize = 48;
      const bottomMargin = 32; // 2rem
      const iconY = offset.top + offset.height - bottomMargin;

      return (
        <g>
          <defs>
            <filter
              id="rank-icon-shadow"
              x="-30%"
              y="-30%"
              width="160%"
              height="160%"
            >
              <feDropShadow
                dx="0"
                dy="1"
                stdDeviation="2"
                floodColor="#000"
                floodOpacity="0.7"
              />
            </filter>
          </defs>
          {tierCenters.map(({ tier, firstBadge, lastBadge }) => {
            const x1 = scale(firstBadge);
            const x6 = scale(lastBadge);
            if (x1 == null || x6 == null) return null;

            const centerX = (x1 + x6 + bandwidth) / 2;
            const rank = tierData.get(tier);
            // General rank image (no division) from RankV2.images.large_webp
            const imageUrl = rank?.images?.large_webp ?? rank?.images?.large;
            if (!imageUrl) return null;

            // Higher-tier badges have more transparent padding in source images
            const tierScale =
              tier === 8 || tier === 9 ? 1.6 : tier >= 10 ? 1.4 : 1;
            const size = iconSize * tierScale;

            return (
              <image
                key={`rank-icon-${tier}`}
                href={imageUrl}
                x={centerX - size / 2}
                y={iconY - size / 2}
                width={size}
                height={size}
                filter="url(#rank-icon-shadow)"
                style={{ pointerEvents: "none" }}
              />
            );
          })}
        </g>
      );
    };
  }, [tierCenters, tierData, badgeMap]);

  return (
    <ChartContainer
      config={{ matches: { label: "Matches" } }}
      className="h-full w-full"
    >
      <BarChart accessibilityLayer data={chartData}>
        <CartesianGrid vertical={false} />
        <Bar dataKey="matches" fill="var(--color-accent)" radius={4}>
          {chartData.map((entry) => (
            <Cell
              key={`cell-${entry.badge}`}
              fill={
                entry.isSpacer
                  ? "transparent"
                  : (tierData.get(entry.tier)?.color ?? "var(--color-accent)")
              }
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
            const imageUrl = info?.small_webp ?? info?.small;
            return (
              <div className="rounded-md bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md flex items-center gap-2">
                {imageUrl && (
                  <img
                    src={imageUrl}
                    alt={`${rankName} ${subtier}`}
                    className="size-5"
                  />
                )}
                <div>
                  <div className="font-medium">
                    {rankName} {subtier}
                  </div>
                  <div>{entry.matches.toLocaleString()} matches</div>
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
        <YAxis dataKey="matches" tickCount={4} textAnchor="end">
          <Label value="Matches" position="middle" textAnchor="middle" />
        </YAxis>
        <Customized component={RankIconsOverlay} />
      </BarChart>
    </ChartContainer>
  );
}
