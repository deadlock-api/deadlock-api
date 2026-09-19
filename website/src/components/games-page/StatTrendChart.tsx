import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiGameStatsRequest, GameStatsBucketEnum } from "deadlock_api_client";
import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartReadings } from "~/components/analytics/ChartReadings";
import { LoadingLogo } from "~/components/LoadingLogo";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { day } from "~/dayjs";
import { gameStatsQueryOptions } from "~/queries/games-query";

import { formatAxisTick, formatStatValue, type StatDefinition, valueSpan } from "./stat-definitions";

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
        matches: entry.total_matches,
      }));
  }, [data, stat.key]);
  const span = valueSpan(chartData);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">{stat.label}</span>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          aria-label={`${stat.label} time interval`}
          value={bucket}
          onValueChange={(value) => value && onBucketChange(value as GameStatsBucketEnum)}
        >
          {STAT_TREND_BUCKETS.map((option) => (
            <ToggleGroupItem key={option.value} value={option.value}>
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
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
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="date"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(ts) => day.utc(ts).format(bucketDef.tickFormat)}
                stroke="var(--muted-foreground)"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickMargin={8}
                minTickGap={28}
              />
              <YAxis
                domain={["dataMin", "auto"]}
                tickFormatter={(v) => formatAxisTick(v, stat.format, span)}
                stroke="var(--muted-foreground)"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickMargin={6}
                width={56}
              />
              <Tooltip
                wrapperStyle={{ pointerEvents: "auto" }}
                isAnimationActive={false}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const entry = payload[0].payload;
                  return (
                    <ChartReadings
                      title={day.utc(Number(label)).format(`${bucketDef.tooltipFormat} [UTC]`)}
                      rows={[
                        { label: stat.label, value: formatStatValue(entry.value, stat.format) },
                        ...(stat.key === "total_matches"
                          ? []
                          : [{ label: "Matches", value: entry.matches.toLocaleString("en-US") }]),
                      ]}
                    />
                  );
                }}
              />
              <Area
                type="linear"
                isAnimationActive={false}
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
