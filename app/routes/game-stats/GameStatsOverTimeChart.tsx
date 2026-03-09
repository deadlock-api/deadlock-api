import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LoadingLogo } from "~/components/LoadingLogo";
import { day } from "~/dayjs";
import type { GameStatsBucket, GameStatsParams } from "~/lib/game-stats-api";
import { cn } from "~/lib/utils";
import { gameStatsQueryOptions } from "~/queries/game-stats-query";
import { StatSelector } from "./StatSelector";
import { formatStatValue, getStatDefinition } from "./stat-definitions";

const TIME_BUCKETS = [
  { value: "start_time_day", label: "Daily" },
  { value: "start_time_week", label: "Weekly" },
  { value: "start_time_month", label: "Monthly" },
] as const;

interface GameStatsOverTimeChartProps {
  params: GameStatsParams;
  stat: string;
  onStatChange: (stat: string) => void;
  timeBucket: GameStatsBucket;
  onTimeBucketChange: (bucket: GameStatsBucket) => void;
  isStreetBrawl?: boolean;
}

export default function GameStatsOverTimeChart({
  params,
  stat,
  onStatChange,
  timeBucket,
  onTimeBucketChange,
  isStreetBrawl = false,
}: GameStatsOverTimeChartProps) {
  const { data, isPending } = useQuery(
    gameStatsQueryOptions({ ...params, bucket: timeBucket }),
  );

  const statDef = getStatDefinition(stat);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data
      .sort((a, b) => a.bucket - b.bucket)
      .map((entry) => ({
        date: day.unix(entry.bucket).valueOf(),
        value: entry[stat as keyof typeof entry] as number,
      }));
  }, [data, stat]);

  return (
    <div className="flex flex-col gap-4">
      <StatSelector value={stat} onChange={onStatChange} isStreetBrawl={isStreetBrawl}>
        <div className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] p-0.5">
          {TIME_BUCKETS.map((b) => (
            <button
              key={b.value}
              type="button"
              onClick={() => onTimeBucketChange(b.value as GameStatsBucket)}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer",
                timeBucket === b.value
                  ? "bg-white/[0.1] text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/[0.05]",
              )}
            >
              {b.label}
            </button>
          ))}
        </div>
      </StatSelector>

      {isPending ? (
        <div className="flex items-center justify-center py-16">
          <LoadingLogo />
        </div>
      ) : chartData.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-8">No data available.</div>
      ) : (
        <ResponsiveContainer width="100%" height={500} className="p-4 bg-muted rounded-xl">
          <LineChart data={chartData} margin={{ top: 20, right: 30, bottom: 60, left: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
            <XAxis
              dataKey="date"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(ts) => day(ts).format("MM/DD/YY")}
              label={{ value: "Date", position: "insideBottom", offset: -10 }}
              stroke="#525252"
            />
            <YAxis
              domain={["dataMin", "auto"]}
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
              labelFormatter={(label) => day(label).format("YYYY-MM-DD")}
              formatter={(value: number) => [statDef ? formatStatValue(value, statDef.format) : value, statDef?.label ?? stat]}
              contentStyle={{ backgroundColor: "#0a0a0a", borderColor: "#1a1a1a" }}
              itemStyle={{ color: "#e5e5e5" }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--color-primary)"
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
              strokeWidth={2}
              name={statDef?.label}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
