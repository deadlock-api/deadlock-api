import { useId } from "react";
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";

import { ChartReading, ChartReadings } from "~/components/patterns/charts/ChartReadings";
import { ChartEmpty, ChartError, ChartLoading } from "~/components/patterns/charts/ChartStates";
import { chartSizeVariants, ChartSurface } from "~/components/patterns/charts/ChartSurface";
import { CHART_COLOR, CHART_GRID, CHART_MARGIN, CHART_X_AXIS, CHART_Y_AXIS } from "~/components/patterns/charts/theme";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { day } from "~/dayjs";
import { formatAxisTick, formatStatValue, type StatFormat, type StatTrendPoint, valueSpan } from "~/lib/stat-format";
import { cn } from "~/lib/utils";

const STAT_TREND_BUCKETS = [
  { value: "start_time_hour", label: "Hour", tickFormat: "MM/DD HH:mm", tooltipFormat: "YYYY-MM-DD HH:mm" },
  { value: "start_time_day", label: "Day", tickFormat: "MM/DD", tooltipFormat: "YYYY-MM-DD" },
  { value: "start_time_week", label: "Week", tickFormat: "MM/DD", tooltipFormat: "YYYY-MM-DD" },
  { value: "start_time_month", label: "Month", tickFormat: "MM/YY", tooltipFormat: "YYYY-MM" },
] as const satisfies ReadonlyArray<{
  value: string;
  label: string;
  tickFormat: string;
  tooltipFormat: string;
}>;

// The states take the plot's height, so the hover card does not resize between them.
const STATE_SIZE = cn(chartSizeVariants({ size: "md" }), "grid");

export type StatTrendBucket = (typeof STAT_TREND_BUCKETS)[number]["value"];

interface StatTrendChartProps extends Omit<React.ComponentProps<"div">, "onChange" | "defaultValue"> {
  data: StatTrendPoint[];
  /** What the plot area shows: the chart, the loader or the failure. */
  state?: "ready" | "loading" | "error";
  stat: { label: string; format: StatFormat };
  /** The time bucket the series is grouped into. */
  value?: StatTrendBucket;
  onValueChange?: (value: StatTrendBucket) => void;
}

export default function StatTrendChart({
  data: chartData,
  state = "ready",
  stat,
  value = "start_time_day",
  onValueChange,
  className,
  ...props
}: StatTrendChartProps) {
  const fillId = useId();
  const bucketDef = STAT_TREND_BUCKETS.find((b) => b.value === value) ?? STAT_TREND_BUCKETS[1];
  const span = valueSpan(chartData);

  return (
    <div className={cn("flex flex-col gap-2", className)} {...props}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">{stat.label}</span>
        <Segmented
          size="sm"
          width="hug"
          aria-label={`${stat.label} time interval`}
          value={value}
          onValueChange={onValueChange}
        >
          {STAT_TREND_BUCKETS.map((option) => (
            <SegmentedItem key={option.value} value={option.value}>
              {option.label}
            </SegmentedItem>
          ))}
        </Segmented>
      </div>

      <div aria-live="polite" aria-busy={state === "loading"}>
        {state === "loading" ? (
          <ChartLoading label={`${stat.label} trend`} size="md" />
        ) : state === "error" ? (
          <ChartError label={`${stat.label} trend`} className={STATE_SIZE} />
        ) : !chartData.some((point) => point.value != null) ? (
          <ChartEmpty label={`${stat.label} trend`} className={STATE_SIZE} />
        ) : (
          <ChartSurface label={`${stat.label} over time`} size="md" variant="bare">
            <AreaChart data={chartData} margin={CHART_MARGIN}>
              <defs>
                <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_COLOR.primary} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={CHART_COLOR.primary} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid {...CHART_GRID} />
              <XAxis
                dataKey="date"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(ts) => day.utc(ts).format(bucketDef.tickFormat)}
                {...CHART_X_AXIS}
                tickMargin={8}
                minTickGap={28}
              />
              <YAxis
                domain={["dataMin", "auto"]}
                tickFormatter={(v) => formatAxisTick(v, stat.format, span)}
                {...CHART_Y_AXIS}
                tickMargin={6}
              />
              <Tooltip
                wrapperStyle={{ pointerEvents: "auto" }}
                isAnimationActive={false}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const entry = payload[0].payload;
                  return (
                    <ChartReadings title={day.utc(Number(label)).format(`${bucketDef.tooltipFormat} [UTC]`)}>
                      <ChartReading label={stat.label}>{formatStatValue(entry.value, stat.format)}</ChartReading>
                      {entry.matches != null && (
                        <ChartReading label="Matches">{entry.matches.toLocaleString("en-US")}</ChartReading>
                      )}
                    </ChartReadings>
                  );
                }}
              />
              <Area
                type="linear"
                isAnimationActive={false}
                dataKey="value"
                stroke={CHART_COLOR.primary}
                fill={`url(#${fillId})`}
                dot={chartData.length === 1 ? { r: 3, strokeWidth: 0 } : false}
                activeDot={{ r: 3, strokeWidth: 0 }}
                strokeWidth={2}
                name={stat.label}
              />
            </AreaChart>
          </ChartSurface>
        )}
      </div>
    </div>
  );
}
