import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiGameStatsRequest, GameStatsBucketEnum } from "deadlock_api_client";
import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { LoadingLogo } from "~/components/LoadingLogo";
import { day } from "~/dayjs";
import { cn } from "~/lib/utils";
import { gameStatsQueryOptions } from "~/queries/games-query";

import { formatStatValue, type StatDefinition } from "./stat-definitions";

export const STAT_TREND_BUCKETS = [
  { value: "start_time_hour", label: "Hour", tickFormat: "MM/DD HH:mm", tooltipFormat: "YYYY-MM-DD HH:mm" },
  { value: "start_time_day", label: "Day", tickFormat: "MM/DD", tooltipFormat: "YYYY-MM-DD" },
  { value: "start_time_week", label: "Week", tickFormat: "MM/DD", tooltipFormat: "YYYY-MM-DD" },
  { value: "start_time_month", label: "Month", tickFormat: "MM/YY", tooltipFormat: "YYYY-MM" },
] as const satisfies ReadonlyArray<{
  value: GameStatsBucketEnum;
  label: string;
  tickFormat: string;
  tooltipFormat: string;
}>;

interface StatTrendChartProps {
  params: AnalyticsApiGameStatsRequest;
  stat: StatDefinition;
  bucket: GameStatsBucketEnum;
  onBucketChange: (bucket: GameStatsBucketEnum) => void;
}

export default function StatTrendChart({ params, stat, bucket, onBucketChange }: StatTrendChartProps) {
  const { data, isPending } = useQuery(gameStatsQueryOptions({ ...params, bucket }));

  const bucketDef = STAT_TREND_BUCKETS.find((b) => b.value === bucket) ?? STAT_TREND_BUCKETS[1];

  const chartData = useMemo(() => {
    if (!data) return [];
    return [...data]
      .sort((a, b) => a.bucket - b.bucket)
      .map((entry) => ({
        date: day.unix(entry.bucket).valueOf(),
        value: entry[stat.key] as number,
      }));
  }, [data, stat.key]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">{stat.label}</span>
        <div className="flex items-center gap-0.5 rounded-md border border-white/[0.06] bg-white/[0.02] p-0.5">
          {STAT_TREND_BUCKETS.map((b) => (
            <button
              key={b.value}
              type="button"
              onClick={() => onBucketChange(b.value)}
              className={cn(
                "cursor-pointer rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                bucket === b.value
                  ? "bg-white/[0.1] text-foreground"
                  : "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground",
              )}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      <div aria-live="polite" aria-busy={isPending}>
        {isPending ? (
          <div className="flex h-[220px] items-center justify-center">
            <LoadingLogo />
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-[220px] items-center justify-center text-xs text-muted-foreground">
            No data available.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: 12 }}>
              <defs>
                <linearGradient id="stat-trend-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis
                dataKey="date"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(ts) => day(ts).format(bucketDef.tickFormat)}
                stroke="#3f3f46"
                tick={{ fontSize: 11, fill: "#a1a1aa" }}
                tickMargin={8}
                minTickGap={28}
              />
              <YAxis
                domain={["dataMin", "auto"]}
                tickFormatter={(v) => formatStatValue(v, stat.format)}
                stroke="#3f3f46"
                tick={{ fontSize: 11, fill: "#a1a1aa" }}
                tickMargin={6}
                width={56}
              />
              <Tooltip
                labelFormatter={(label) => day(label).format(bucketDef.tooltipFormat)}
                formatter={(value) => [formatStatValue(value as number, stat.format), stat.label]}
                contentStyle={{
                  backgroundColor: "#0a0a0a",
                  borderColor: "#27272a",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: "#a1a1aa" }}
                itemStyle={{ color: "var(--color-primary)" }}
                cursor={{ stroke: "#52525b", strokeDasharray: "3 3" }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--color-primary)"
                fill="url(#stat-trend-fill)"
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
                strokeWidth={2}
                name={stat.label}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
