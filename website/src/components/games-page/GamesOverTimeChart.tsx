import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiGameStatsRequest, GameStatsBucketEnum } from "deadlock_api_client";
import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";

import { ChartReadings } from "~/components/analytics/ChartReadings";
import { ChartLoading, ChartError, ChartEmpty } from "~/components/analytics/ChartStates";
import { ChartSurface } from "~/components/analytics/ChartSurface";
import { TrendControls } from "~/components/analytics/TrendControls";
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
  { value: "start_time_day", label: "Day" },
  { value: "start_time_week", label: "Week" },
  { value: "start_time_month", label: "Month" },
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
  const { data, isPending, isError, isFetching, refetch } = useQuery(
    gameStatsQueryOptions({ ...params, bucket: timeBucket }),
  );

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
    <div className="flex flex-col gap-3">
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
          <ChartLoading label="game trends" />
        ) : isError ? (
          <ChartError label="game trends" retrying={isFetching} onRetry={() => void refetch()} />
        ) : chartData.length === 0 ? (
          <ChartEmpty label="game trends" />
        ) : (
          <section className="overflow-hidden rounded-xl border bg-card" aria-label="Game trend chart">
            <div className="flex flex-wrap items-baseline justify-between gap-1 px-3 pt-3">
              <h3 className="text-sm font-semibold">{statDef?.label ?? stat} over time</h3>
              <p className="text-xs text-muted-foreground">
                {day.utc(chartData[0].date).format("MMM D, YYYY")} –{" "}
                {day.utc(chartData.at(-1)!.date).format("MMM D, YYYY")} · UTC
              </p>
            </div>
            <ChartSurface label={`${statDef?.label ?? stat} over time chart`} className="rounded-none border-0">
              <LineChart data={chartData} margin={{ top: 16, right: 12, bottom: 8, left: 0 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                  vertical={false}
                  verticalCoordinatesGenerator={() => []}
                />
                <XAxis
                  dataKey="date"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(ts) => day.utc(ts).format("MMM D")}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                  minTickGap={28}
                  stroke="var(--muted-foreground)"
                />
                <YAxis
                  domain={["dataMin", "auto"]}
                  tickFormatter={(v) => (statDef ? formatAxisTick(v, statDef.format, span) : String(v))}
                  stroke="var(--muted-foreground)"
                  width={64}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip
                  wrapperStyle={{ pointerEvents: "auto" }}
                  isAnimationActive={false}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const entry = payload[0].payload;
                    return (
                      <ChartReadings
                        title={day.utc(Number(label)).format("MMM D, YYYY [UTC]")}
                        rows={[
                          {
                            label: statDef?.label ?? stat,
                            value: statDef ? formatStatValue(entry.value, statDef.format) : entry.value,
                          },
                          ...(stat === "total_matches"
                            ? []
                            : [{ label: "Matches", value: entry.matches.toLocaleString("en-US") }]),
                        ]}
                      />
                    );
                  }}
                />
                <Line
                  type="linear"
                  dataKey="value"
                  stroke="var(--color-primary)"
                  dot={chartData.length <= 100 ? { r: 2.5 } : false}
                  isAnimationActive={false}
                  activeDot={{ r: 5 }}
                  strokeWidth={2}
                  name={statDef?.label}
                />
              </LineChart>
            </ChartSurface>
            <p className="border-t px-3 py-2 text-xs text-muted-foreground">
              {chartData.length.toLocaleString("en-US")} buckets · The ongoing interval is omitted when at least two
              completed intervals are available.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
