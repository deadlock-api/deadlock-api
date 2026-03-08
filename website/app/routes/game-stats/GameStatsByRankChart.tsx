import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LoadingLogo } from "~/components/LoadingLogo";
import { assetsApi } from "~/lib/assets-api";
import type { GameStatsParams } from "~/lib/game-stats-api";
import { gameStatsQueryOptions } from "~/queries/game-stats-query";
import { StatSelector } from "./StatSelector";
import { formatStatValue, getStatDefinition } from "./stat-definitions";

interface GameStatsByRankChartProps {
  params: GameStatsParams;
  stat: string;
  onStatChange: (stat: string) => void;
}

export default function GameStatsByRankChart({ params, stat, onStatChange }: GameStatsByRankChartProps) {
  const { data, isPending } = useQuery(
    gameStatsQueryOptions({ ...params, bucket: "avg_badge" }),
  );

  const { data: ranksData } = useQuery({
    queryKey: ["ranks"],
    queryFn: async () => {
      const response = await assetsApi.default_api.getRanksV2RanksGet();
      return response.data;
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

  const tierData = useMemo(() => {
    const map = new Map<number, { name: string; color?: string | null }>();
    ranksData?.forEach((r) => map.set(r.tier, { name: r.name, color: r.color }));
    return map;
  }, [ranksData]);

  const statDef = getStatDefinition(stat);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data
      .filter((entry) => entry.bucket > 0)
      .sort((a, b) => a.bucket - b.bucket)
      .map((entry) => {
        const tier = Math.floor(entry.bucket / 10);
        const subtier = entry.bucket % 10;
        const rankInfo = tierData.get(tier);
        return {
          badge: entry.bucket,
          tier,
          label: rankInfo ? `${rankInfo.name} ${subtier}` : `${entry.bucket}`,
          value: entry[stat as keyof typeof entry] as number,
          color: rankInfo?.color ?? "var(--color-accent)",
        };
      });
  }, [data, stat, tierData]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-center sm:flex-nowrap gap-2">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-muted-foreground">Stat</span>
          <StatSelector value={stat} onChange={onStatChange} />
        </div>
      </div>

      {isPending ? (
        <div className="flex items-center justify-center py-16">
          <LoadingLogo />
        </div>
      ) : chartData.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-8">No data available.</div>
      ) : (
        <ResponsiveContainer width="100%" height={500} className="p-4 bg-muted rounded-xl">
          <BarChart data={chartData} margin={{ top: 20, right: 30, bottom: 60, left: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" vertical={false} />
            <XAxis
              dataKey="label"
              angle={-45}
              textAnchor="end"
              interval={0}
              height={80}
              tick={{ fontSize: 11 }}
              stroke="#525252"
            />
            <YAxis
              domain={["auto", "auto"]}
              tickFormatter={(v) => statDef ? formatStatValue(v, statDef.format) : String(v)}
              stroke="#525252"
              label={{
                value: statDef?.label ?? stat,
                angle: -90,
                position: "insideLeft",
                offset: -25,
              }}
            />
            <Tooltip
              formatter={(value: number) => [statDef ? formatStatValue(value, statDef.format) : value, statDef?.label ?? stat]}
              contentStyle={{ backgroundColor: "#0a0a0a", borderColor: "#1a1a1a" }}
              itemStyle={{ color: "#e5e5e5" }}
              cursor={false}
            />
            <Bar dataKey="value" radius={4}>
              {chartData.map((entry) => (
                <Cell key={entry.badge} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
