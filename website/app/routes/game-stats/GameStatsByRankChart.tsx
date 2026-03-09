import { useQuery } from "@tanstack/react-query";
import type { RankV2 } from "assets_deadlock_api_client";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Customized, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LoadingLogo } from "~/components/LoadingLogo";
import { assetsApi } from "~/lib/assets-api";
import type { GameStatsParams } from "~/lib/game-stats-api";
import { extractBadgeMap } from "~/lib/leaderboard";
import { gameStatsQueryOptions } from "~/queries/game-stats-query";
import { StatSelector } from "./StatSelector";
import { formatStatValue, getStatDefinition } from "./stat-definitions";

interface GameStatsByRankChartProps {
  params: GameStatsParams;
  stat: string;
  onStatChange: (stat: string) => void;
  isStreetBrawl?: boolean;
}

interface ChartEntry {
  badge: number;
  tier: number;
  label: string;
  value: number;
  color: string;
  isSpacer?: boolean;
}

export default function GameStatsByRankChart({ params, stat, onStatChange, isStreetBrawl = false }: GameStatsByRankChartProps) {
  const { data, isPending } = useQuery(gameStatsQueryOptions({ ...params, bucket: "avg_badge" }));

  const { data: ranksData } = useQuery({
    queryKey: ["ranks"],
    queryFn: async () => {
      const response = await assetsApi.default_api.getRanksV2RanksGet();
      return response.data;
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

  const tierData = useMemo(() => {
    const map = new Map<number, RankV2>();
    ranksData?.forEach((r) => map.set(r.tier, r));
    return map;
  }, [ranksData]);

  const badgeMap = useMemo(() => extractBadgeMap(ranksData ?? []), [ranksData]);

  const statDef = getStatDefinition(stat);

  const chartData = useMemo(() => {
    if (!data) return [];
    const sorted = data.filter((entry) => entry.bucket > 0).sort((a, b) => a.bucket - b.bucket);

    if (sorted.length === 0) return [];

    const result: ChartEntry[] = [];
    let lastTier = -1;

    for (const entry of sorted) {
      const tier = Math.floor(entry.bucket / 10);
      const subtier = entry.bucket % 10;
      const rank = tierData.get(tier);

      if (lastTier !== -1 && tier !== lastTier) {
        result.push({
          badge: lastTier * 10 + 7,
          tier: lastTier,
          label: "",
          value: 0,
          color: "transparent",
          isSpacer: true,
        });
      }

      result.push({
        badge: entry.bucket,
        tier,
        label: rank ? `${rank.name} ${subtier}` : `${entry.bucket}`,
        value: entry[stat as keyof typeof entry] as number,
        color: rank?.color ?? "var(--color-accent)",
      });

      lastTier = tier;
    }

    return result;
  }, [data, stat, tierData]);

  const tierCenters = useMemo(() => {
    if (chartData.length === 0) return [];
    const tiers = new Map<number, { firstBadge: number; lastBadge: number }>();
    for (const entry of chartData) {
      if (entry.isSpacer) continue;
      const existing = tiers.get(entry.tier);
      if (!existing) {
        tiers.set(entry.tier, { firstBadge: entry.badge, lastBadge: entry.badge });
      } else {
        existing.lastBadge = entry.badge;
      }
    }
    return Array.from(tiers.entries()).map(([tier, { firstBadge, lastBadge }]) => ({
      tier,
      firstBadge,
      lastBadge,
    }));
  }, [chartData]);

  const RankIconsOverlay = useMemo(() => {
    return function RankIcons(props: Record<string, unknown>) {
      const xAxisMap = props.xAxisMap as
        | Record<string, { scale: (v: number) => number | undefined; bandSize?: number }>
        | undefined;
      const offset = props.offset as { top: number; height: number } | undefined;
      if (!xAxisMap || !offset) return null;

      const xAxis = Object.values(xAxisMap)[0];
      const scale = xAxis?.scale;
      const bandwidth = xAxis?.bandSize ?? 0;
      if (!scale) return null;

      const iconSize = 48;
      const bottomMargin = 32;
      const iconY = offset.top + offset.height - bottomMargin;

      return (
        <g>
          <defs>
            <filter id="rank-icon-shadow-stats" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000" floodOpacity="0.7" />
            </filter>
          </defs>
          {tierCenters.map(({ tier, firstBadge, lastBadge }) => {
            const x1 = scale(firstBadge);
            const x6 = scale(lastBadge);
            if (x1 == null || x6 == null) return null;

            const centerX = (x1 + x6 + bandwidth) / 2;
            const rank = tierData.get(tier);
            const imageUrl = rank?.images?.large_webp ?? rank?.images?.large;
            if (!imageUrl) return null;

            const tierScale = tier === 8 || tier === 9 ? 1.6 : tier >= 10 ? 1.4 : 1;
            const size = iconSize * tierScale;

            return (
              <image
                key={`rank-icon-${tier}`}
                href={imageUrl}
                x={centerX - size / 2}
                y={iconY - size / 2}
                width={size}
                height={size}
                filter="url(#rank-icon-shadow-stats)"
                style={{ pointerEvents: "none" }}
              />
            );
          })}
        </g>
      );
    };
  }, [tierCenters, tierData]);

  return (
    <div className="flex flex-col gap-4">
      <StatSelector value={stat} onChange={onStatChange} isStreetBrawl={isStreetBrawl} />

      {isPending ? (
        <div className="flex items-center justify-center py-16">
          <LoadingLogo />
        </div>
      ) : chartData.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-8">No data available.</div>
      ) : (
        <ResponsiveContainer width="100%" height={650} className="p-2 bg-muted rounded-xl">
          <BarChart data={chartData} margin={{ top: 16, right: 20, bottom: 40, left: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" vertical={false} />
            <XAxis
              dataKey="badge"
              angle={-45}
              textAnchor="end"
              interval={0}
              height={80}
              tick={{ fontSize: 11 }}
              stroke="#525252"
              tickFormatter={(badge: number) => {
                const entry = chartData.find((e) => e.badge === badge);
                if (!entry || entry.isSpacer) return "";
                return entry.label;
              }}
            />
            <YAxis
              domain={["dataMin", "auto"]}
              tickFormatter={(v) => (statDef ? formatStatValue(v, statDef.format) : String(v))}
              stroke="#525252"
              label={{
                value: statDef?.label ?? stat,
                angle: -90,
                position: "insideLeft",
                offset: -25,
              }}
            />
            <Tooltip
              cursor={false}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const entry = payload[0].payload as ChartEntry;
                if (entry.isSpacer) return null;
                const info = badgeMap.get(entry.badge);
                const imageUrl = info?.small_webp ?? info?.small;
                return (
                  <div className="rounded-md bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md flex items-center gap-2">
                    {imageUrl && <img src={imageUrl} alt={entry.label} className="size-5" />}
                    <div>
                      <div className="font-medium">{entry.label}</div>
                      <div className="text-muted-foreground">
                        {statDef?.label}: {statDef ? formatStatValue(entry.value, statDef.format) : entry.value}
                      </div>
                    </div>
                  </div>
                );
              }}
            />
            <Bar dataKey="value" radius={4}>
              {chartData.map((entry) => (
                <Cell key={entry.badge} fill={entry.isSpacer ? "transparent" : entry.color} />
              ))}
            </Bar>
            <Customized component={RankIconsOverlay} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
