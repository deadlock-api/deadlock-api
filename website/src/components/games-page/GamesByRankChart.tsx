import { useQuery } from "@tanstack/react-query";
import type { Rank } from "deadlock_api_client";
import type { AnalyticsApiGameStatsRequest } from "deadlock_api_client";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Customized, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { LoadingLogo } from "~/components/LoadingLogo";
import { RANK_ICON_AXIS_HEIGHT, RankTierIcons } from "~/components/RankTierIcons";
import { extractBadgeMap } from "~/lib/leaderboard";
import { gameStatsQueryOptions } from "~/queries/games-query";
import { ranksQueryOptions } from "~/queries/ranks-query";

import { formatAxisTick, formatStatValue, getStatDefinition, valueSpan } from "./stat-definitions";
import { StatSelector } from "./StatSelector";

interface GamesByRankChartProps {
  params: AnalyticsApiGameStatsRequest;
  stat: string;
  onStatChange: (stat: string) => void;
  isStreetBrawl?: boolean;
}

interface ChartEntry {
  badge: number;
  tier: number;
  label: string;
  /** `null` on the gaps between tiers, so they neither draw a bar nor pull the y axis down to zero. */
  value: number | null;
  color: string;
  isSpacer?: boolean;
}

export default function GamesByRankChart({ params, stat, onStatChange, isStreetBrawl = false }: GamesByRankChartProps) {
  const { data, isPending } = useQuery(gameStatsQueryOptions({ ...params, bucket: "avg_badge" }));

  const { data: ranksData } = useQuery(ranksQueryOptions);

  const tierData = useMemo(() => {
    const map = new Map<number, Rank>();
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
          value: null,
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
  const span = valueSpan(chartData);

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

  return (
    <div className="flex flex-col gap-4">
      <StatSelector value={stat} onChange={onStatChange} isStreetBrawl={isStreetBrawl} />

      <div aria-live="polite" aria-busy={isPending}>
        {isPending ? (
          <div className="flex items-center justify-center py-16">
            <LoadingLogo />
          </div>
        ) : chartData.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No data available.</div>
        ) : (
          <figure aria-label={`${statDef?.label ?? stat} by rank chart`}>
            <ResponsiveContainer width="100%" height={650} className="rounded-xl bg-muted p-2">
              <BarChart data={chartData} margin={{ top: 16, right: 20, bottom: 12, left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" vertical={false} />
                <XAxis dataKey="badge" tick={false} height={RANK_ICON_AXIS_HEIGHT} stroke="#525252" />
                <YAxis
                  domain={["dataMin", "auto"]}
                  tickFormatter={(v) => (statDef ? formatAxisTick(v, statDef.format, span) : String(v))}
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
                    const imageUrl = info?.large_webp ?? info?.large;
                    return (
                      <div className="flex items-center gap-2 rounded-md bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md">
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
                <Customized component={<RankTierIcons tiers={tierCenters} ranks={tierData} />} />
              </BarChart>
            </ResponsiveContainer>
          </figure>
        )}
      </div>
    </div>
  );
}
