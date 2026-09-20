import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiGameStatsRequest, GameStatsBucketEnum } from "deadlock_api_client";
import { ChartNoAxesCombined } from "lucide-react";
import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";

import { ChartCard } from "~/components/patterns/charts/ChartCard";
import { ChartReading, ChartReadings } from "~/components/patterns/charts/ChartReadings";
import { ChartLoading, ChartError, ChartEmpty } from "~/components/patterns/charts/ChartStates";
import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import { CHART_AXIS, CHART_GRID } from "~/components/patterns/charts/theme";
import { TrendIntervalField, TrendMetricField } from "~/components/patterns/charts/TrendControls";
import { FilterBar } from "~/components/patterns/filter-bar/FilterBar";
import { SegmentedItem } from "~/components/ui/segmented";
import { SelectGroup, SelectItem, SelectLabel } from "~/components/ui/select";
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
  const categories = useMemo(() => getFilteredCategories(isStreetBrawl), [isStreetBrawl]);

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
      <FilterBar variant="toolbar" title="Game trends" icon={ChartNoAxesCombined} aria-label="Trend controls">
        <TrendMetricField value={stat} valueLabel={statDef?.label} onValueChange={onStatChange}>
          {categories.map((category) => (
            <SelectGroup key={category.label}>
              <SelectLabel>{category.label}</SelectLabel>
              {category.stats.map((option) => (
                <SelectItem key={option.key} value={option.key}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </TrendMetricField>
        <TrendIntervalField
          value={timeBucket}
          onValueChange={(value) => onTimeBucketChange(value as GameStatsBucketEnum)}
        >
          {TIME_BUCKETS.map((entry) => (
            <SegmentedItem key={entry.value} value={entry.value}>
              {entry.label}
            </SegmentedItem>
          ))}
        </TrendIntervalField>
      </FilterBar>

      <div aria-live="polite" aria-busy={isPending}>
        {isPending ? (
          <ChartLoading label="game trends" />
        ) : isError ? (
          <ChartError label="game trends" retrying={isFetching} onRetry={() => void refetch()} />
        ) : chartData.length === 0 ? (
          <ChartEmpty label="game trends" />
        ) : (
          <ChartCard
            title={`${statDef?.label ?? stat} over time`}
            description={`${day.utc(chartData[0].date).format("MMM D, YYYY")} – ${day.utc(chartData.at(-1)!.date).format("MMM D, YYYY")} · UTC`}
            footer={`${chartData.length.toLocaleString("en-US")} buckets · The ongoing interval is omitted when at least two completed intervals are available.`}
          >
            <ChartSurface label={`${statDef?.label ?? stat} over time chart`} variant="flush">
              <LineChart data={chartData} margin={{ top: 16, right: 12, bottom: 8, left: 0 }}>
                <CartesianGrid {...CHART_GRID} verticalCoordinatesGenerator={() => []} />
                <XAxis
                  dataKey="date"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(ts) => day.utc(ts).format("MMM D")}
                  {...CHART_AXIS}
                  minTickGap={28}
                />
                <YAxis
                  domain={["dataMin", "auto"]}
                  tickFormatter={(v) => (statDef ? formatAxisTick(v, statDef.format, span) : String(v))}
                  {...CHART_AXIS}
                  width={64}
                />
                <Tooltip
                  wrapperStyle={{ pointerEvents: "auto" }}
                  isAnimationActive={false}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const entry = payload[0].payload;
                    return (
                      <ChartReadings title={day.utc(Number(label)).format("MMM D, YYYY [UTC]")}>
                        <ChartReading label={statDef?.label ?? stat}>
                          {statDef ? formatStatValue(entry.value, statDef.format) : entry.value}
                        </ChartReading>
                        {stat !== "total_matches" && (
                          <ChartReading label="Matches">{entry.matches.toLocaleString("en-US")}</ChartReading>
                        )}
                      </ChartReadings>
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
          </ChartCard>
        )}
      </div>
    </div>
  );
}
