import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiGameStatsRequest, GameStatsBucketEnum } from "deadlock_api_client";
import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";

import { PatchMarkers } from "~/components/domain/charts/PatchMarkers";
import { ChartCard } from "~/components/patterns/charts/ChartCard";
import { ChartReading, ChartReadings } from "~/components/patterns/charts/ChartReadings";
import { ChartLoading, ChartError, ChartEmpty } from "~/components/patterns/charts/ChartStates";
import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import {
  CHART_GRID,
  CHART_MARGIN_MARKED,
  CHART_X_AXIS,
  CHART_Y_AXIS,
  CHART_COLOR,
} from "~/components/patterns/charts/theme";
import { TrendIntervalField } from "~/components/patterns/charts/TrendControls";
import { NoValue } from "~/components/ui/no-value";
import { SegmentedItem } from "~/components/ui/segmented";
import { Stat, StatGroup } from "~/components/ui/stat";
import { day } from "~/dayjs";
import { BUFF_TIMINGS_NOTE } from "~/lib/buffs";
import { formatAxisTick, formatStatValue, getStatDefinition, valueSpan } from "~/lib/game-stat-definitions";
import { wholeTimeBuckets } from "~/lib/time-buckets";
import { gameStatsQueryOptions } from "~/queries/games-query";

import { StatSelector } from "./StatSelector";

const TIME_BUCKETS = [
  { value: "start_time_day", label: "Day", one: "day", other: "days" },
  { value: "start_time_week", label: "Week", one: "week", other: "weeks" },
  { value: "start_time_month", label: "Month", one: "month", other: "months" },
] as const;

const PLURAL = new Intl.PluralRules("en-US");

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

  const chartData = useMemo(() => {
    if (!data) return [];
    return wholeTimeBuckets([...data], timeBucket, params)
      .sort((a, b) => a.bucket - b.bucket)
      .map((entry) => ({
        date: day.unix(entry.bucket).valueOf(),
        value: entry[stat as keyof typeof entry] ?? null,
        matches: entry.total_matches,
      }));
  }, [data, stat, timeBucket, params]);
  const span = valueSpan(chartData);
  const readings = chartData.filter((entry): entry is typeof entry & { value: number } => entry.value != null);
  const latest = readings.at(-1);
  const lowest = readings.reduce<(typeof readings)[number] | undefined>(
    (low, entry) => (low == null || entry.value < low.value ? entry : low),
    undefined,
  );
  const highest = readings.reduce<(typeof readings)[number] | undefined>(
    (high, entry) => (high == null || entry.value > high.value ? entry : high),
    undefined,
  );
  const matches = chartData.reduce((sum, entry) => sum + (entry.matches ?? 0), 0);
  const formatValue = (value: number) => (statDef ? formatStatValue(value, statDef.format) : String(value));
  const formatDate = (date: number) => day.utc(date).format("MMM D, YYYY");
  const bucketDef = TIME_BUCKETS.find((b) => b.value === timeBucket) ?? TIME_BUCKETS[0];
  const bucketUnit = bucketDef[PLURAL.select(chartData.length) === "one" ? "one" : "other"];

  return (
    <div className="@container flex flex-col gap-3">
      <StatSelector value={stat} onChange={onStatChange} isStreetBrawl={isStreetBrawl}>
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
      </StatSelector>

      {/* The plot's numbers as text; it stays while a new interval loads, so the plot below it does not move. */}
      <StatGroup variant="joined" size="sm" className="grid-cols-2 @2xl:grid-cols-4">
        <Stat
          label="Latest"
          value={latest && formatValue(latest.value)}
          sub={latest ? formatDate(latest.date) : <NoValue />}
        />
        <Stat
          label="Lowest"
          value={lowest && formatValue(lowest.value)}
          sub={lowest ? formatDate(lowest.date) : <NoValue />}
        />
        <Stat
          label="Highest"
          value={highest && formatValue(highest.value)}
          sub={highest ? formatDate(highest.date) : <NoValue />}
        />
        <Stat
          label="Matches"
          // A failed load has no count either: not a 0.
          value={isPending || isError ? undefined : matches.toLocaleString("en-US")}
          sub={isPending || isError ? <NoValue /> : `${chartData.length.toLocaleString("en-US")} ${bucketUnit}`}
        />
      </StatGroup>

      {/* The card and its title stay in every state, so a new interval or metric never moves the plot. */}
      <ChartCard
        title={`${statDef?.label ?? stat} over time`}
        description={
          chartData.length > 0 ? (
            `${formatDate(chartData[0].date)} – ${formatDate(chartData.at(-1)!.date)} · UTC`
          ) : (
            // Until the buckets arrive, a hidden line of the same length keeps the header's height (it wraps on a phone).
            <>
              <NoValue />
              <span aria-hidden className="invisible">
                MMM 00, 0000 – MMM 00, 0000 · UTC
              </span>
            </>
          )
        }
      >
        {isPending ? (
          <ChartLoading label="game trends" />
        ) : isError ? (
          <ChartError label="game trends" retrying={isFetching} onRetry={() => void refetch()} />
        ) : chartData.every((entry) => entry.value == null) ? (
          <ChartEmpty label="game trends" description={statDef?.recordedSince ? BUFF_TIMINGS_NOTE : undefined} />
        ) : (
          <ChartSurface label={`${statDef?.label ?? stat} over time chart`} variant="flush">
            <LineChart data={chartData} margin={{ ...CHART_MARGIN_MARKED, right: 12 }}>
              <CartesianGrid {...CHART_GRID} verticalCoordinatesGenerator={() => []} />
              <XAxis
                dataKey="date"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(ts) => day.utc(ts).format("MMM D")}
                {...CHART_X_AXIS}
                minTickGap={28}
              />
              <YAxis
                domain={["dataMin", "auto"]}
                tickFormatter={(v) => (statDef ? formatAxisTick(v, statDef.format, span) : String(v))}
                {...CHART_Y_AXIS}
              />
              <PatchMarkers />
              <Tooltip
                wrapperStyle={{ pointerEvents: "auto" }}
                isAnimationActive={false}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const entry = payload[0].payload;
                  return (
                    <ChartReadings title={day.utc(Number(label)).format("MMM D, YYYY [UTC]")}>
                      <ChartReading label={statDef?.label ?? stat}>
                        {statDef
                          ? (formatStatValue(entry.value, statDef.format) ?? <NoValue label="No data" />)
                          : entry.value}
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
                stroke={CHART_COLOR.primary}
                dot={chartData.length <= 100 ? { r: 2.5 } : false}
                isAnimationActive={false}
                activeDot={{ r: 5 }}
                strokeWidth={2}
                name={statDef?.label}
              />
            </LineChart>
          </ChartSurface>
        )}
      </ChartCard>
    </div>
  );
}
