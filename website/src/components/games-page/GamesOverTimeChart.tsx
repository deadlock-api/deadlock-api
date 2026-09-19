import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiGameStatsRequest, GameStatsBucketEnum } from "deadlock_api_client";
import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { TrendControls } from "~/components/analytics/TrendControls";
import { LoadingLogo } from "~/components/LoadingLogo";
import { day } from "~/dayjs";
import { withoutOpenTimeBucket } from "~/lib/time-buckets";
import { gameStatsQueryOptions } from "~/queries/games-query";

import {
  formatAxisTick,
  formatStatValue,
  getFilteredCategories,
  getStatDefinition,
  valueSpan,
} from "./stat-definitions";

const TIME_BUCKETS = [
  { value: "start_time_day", label: "Daily" },
  { value: "start_time_week", label: "Weekly" },
  { value: "start_time_month", label: "Monthly" },
] as const;

interface GamesOverTimeChartProps {
  params: AnalyticsApiGameStatsRequest;
  stat: string;
  onStatChange: (stat: string) => void;
  timeBucket: GameStatsBucketEnum;
  onTimeBucketChange: (bucket: GameStatsBucketEnum) => void;
  isStreetBrawl?: boolean;
}

export default function GamesOverTimeChart({
  params,
  stat,
  onStatChange,
  timeBucket,
  onTimeBucketChange,
  isStreetBrawl = false,
}: GamesOverTimeChartProps) {
  const { data, isPending } = useQuery(gameStatsQueryOptions({ ...params, bucket: timeBucket }));

  const statDef = getStatDefinition(stat);
  const metricGroups = useMemo(
    () =>
      getFilteredCategories(isStreetBrawl).map((category) => ({
        label: category.label,
        options: category.stats.map((option) => ({ value: option.key, label: option.label })),
      })),
    [isStreetBrawl],
  );

  const chartData = useMemo(() => {
    if (!data) return [];
    return withoutOpenTimeBucket([...data], timeBucket)
      .sort((a, b) => a.bucket - b.bucket)
      .map((entry) => ({
        date: day.unix(entry.bucket).valueOf(),
        value: entry[stat as keyof typeof entry] as number,
        matches: entry.total_matches,
      }));
  }, [data, stat, timeBucket]);
  const span = valueSpan(chartData);

  return (
    <div className="flex flex-col gap-4">
      <TrendControls
        title="Game trends"
        metric={stat}
        metricGroups={metricGroups}
        onMetricChange={onStatChange}
        interval={timeBucket}
        intervals={TIME_BUCKETS}
        onIntervalChange={(value) => onTimeBucketChange(value as GameStatsBucketEnum)}
      />

      <div aria-live="polite" aria-busy={isPending}>
        {isPending ? (
          <div className="flex items-center justify-center py-16">
            <LoadingLogo />
          </div>
        ) : chartData.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No data available.</div>
        ) : (
          <figure aria-label={`${statDef?.label ?? stat} over time chart`}>
            <ResponsiveContainer width="100%" height={500} className="rounded-xl bg-muted p-4">
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
                  labelFormatter={(label) => day(label as number).format("YYYY-MM-DD")}
                  formatter={(value, _name, item) => {
                    const formatted = statDef ? formatStatValue(value as number, statDef.format) : value;
                    const matches = item.payload?.matches;
                    if (matches == null || stat === "total_matches") return [formatted, statDef?.label ?? stat];
                    return [`${formatted} (${matches.toLocaleString("en-US")} matches)`, statDef?.label ?? stat];
                  }}
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
          </figure>
        )}
      </div>
    </div>
  );
}
