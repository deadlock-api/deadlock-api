import { TrendingUp } from "lucide-react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";

import { ChartEmpty, ChartError, ChartLoading } from "~/components/patterns/charts/ChartStates";
import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import {
  CHART_BASELINE,
  CHART_CURSOR_LINE,
  CHART_GRID,
  CHART_X_AXIS,
  SERIES_COLORS,
} from "~/components/patterns/charts/theme";
import { Panel, PanelBody, PanelHeader, PanelSection } from "~/components/patterns/panel/Panel";
import { Button } from "~/components/ui/button";
import { Delta } from "~/components/ui/delta";
import { InlineStat } from "~/components/ui/inline-stat";
import { NoValue } from "~/components/ui/no-value";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { Skeleton } from "~/components/ui/skeleton";
import { TooltipCard, TooltipHeader, TooltipStat, TooltipStats } from "~/components/ui/tooltip";
import { day } from "~/dayjs";
import {
  type MetricPoint,
  type MetricSummary,
  metricSeries,
  rollingMean,
  type StatMatch,
  summarizeMetric,
  TREND_METRICS,
  type TrendMetric,
  type TrendMetricGroup,
} from "~/lib/tracker/match-stats";

const GROUPS: TrendMetricGroup[] = ["Laning", "Combat", "Farming", "Shooting"];
const WINDOWS = ["auto", "5", "10", "20", "50"] as const;
const METRIC_KEYS = TREND_METRICS.map((metric) => metric.key);
// Not the brand red, which reads as a loss beside the win and loss colors of the page.
const COLOR = SERIES_COLORS[3];
/** Twenty points of a long history at most, so the line shows the drift rather than match-to-match noise. */
const autoWindow = (matches: number) => Math.min(50, Math.max(10, Math.ceil(matches / 20)));

/** Every per-match stat as its recent average and change, one of them drawn as a rolling average over time. */
export function StatTrendsPanel({
  matches,
  metrics,
  state,
  onRetry,
  className,
}: {
  matches: StatMatch[];
  /** The metrics the selected mode offers. */
  metrics: TrendMetric[];
  state: "ready" | "loading" | "error";
  onRetry: () => void;
  className?: string;
}) {
  const [chosenKey, setMetricKey] = useQueryState(
    "stat_trend",
    parseAsStringLiteral(METRIC_KEYS).withDefault("lane_diff"),
  );
  // A metric the mode does not offer stays in the URL for when the mode changes back.
  const selected = metrics.find((metric) => metric.key === chosenKey) ?? metrics[0];
  const [windowChoice, setWindowChoice] = useQueryState(
    "stat_window",
    parseAsStringLiteral(WINDOWS).withDefault("auto"),
  );
  const window = windowChoice === "auto" ? autoWindow(matches.length) : Number(windowChoice);
  const rows = useMemo(
    () =>
      metrics.map((metric) => {
        const series = metricSeries(matches, metric);
        return { metric, series, summary: summarizeMetric(series, window) };
      }),
    [matches, metrics, window],
  );
  const current = rows.find((row) => row.metric === selected);
  const points = useMemo(() => (current ? rollingMean(current.series, window) : []), [current, window]);
  const loading = state === "loading";
  const chartLabel = `Rolling ${window}-match ${selected.label.toLowerCase()} over selected matches`;

  return (
    <Panel className={className}>
      <PanelHeader
        title="Stat trends"
        description={`Latest ${window} vs. the ${window} before`}
        icon={TrendingUp}
        size="sm"
      >
        <Segmented
          size="sm"
          width="hug"
          value={windowChoice}
          onValueChange={setWindowChoice}
          aria-label="Matches per average"
        >
          {WINDOWS.map((choice) =>
            choice === "auto" ? (
              <SegmentedItem key={choice} value={choice}>
                Auto
              </SegmentedItem>
            ) : (
              <SegmentedItem key={choice} value={choice}>
                {choice}
                <span className="sr-only"> matches</span>
              </SegmentedItem>
            ),
          )}
        </Segmented>
      </PanelHeader>
      <PanelBody size="sm" className="grid flex-1 gap-3 @3xl/overview:grid-cols-5">
        <div className="flex min-w-0 flex-col gap-1.5 @3xl/overview:col-span-2">
          <InlineStat
            size="lg"
            aria-live="polite"
            aria-atomic="true"
            value={loading ? null : current?.summary.recent == null ? null : selected.format(current.summary.recent)}
            label={`${selected.label} · latest ${window}`}
          />
          {state === "error" ? (
            <ChartError label="stat trends" onRetry={onRetry} />
          ) : loading ? (
            <ChartLoading label="stat trends" size="md" />
          ) : points.length === 0 ? (
            <ChartEmpty
              size="md"
              label={selected.label.toLowerCase()}
              title={`${current?.series.length ?? 0} of ${window} matches have this stat`}
              description={null}
            />
          ) : (
            <ChartSurface label={chartLabel} size="md" variant="bare">
              <AreaChart
                data={points}
                margin={{ top: 4, right: 2, left: 2, bottom: 0 }}
                accessibilityLayer
                aria-label={chartLabel}
              >
                <CartesianGrid {...CHART_GRID} />
                <XAxis
                  {...CHART_X_AXIS}
                  dataKey="time"
                  tickFormatter={(time: number) => day.unix(time).format("MMM D")}
                  minTickGap={35}
                />
                <YAxis domain={["auto", "auto"]} hide />
                {current?.summary.overall != null && <ReferenceLine y={current.summary.overall} {...CHART_BASELINE} />}
                <Tooltip
                  cursor={CHART_CURSOR_LINE}
                  content={<TrendTooltip metric={selected} window={window} overall={current?.summary.overall} />}
                />
                <Area
                  key={selected.key}
                  dataKey="value"
                  type="monotone"
                  stroke={COLOR}
                  fill={COLOR}
                  fillOpacity={0.12}
                  strokeWidth={1.5}
                  dot={points.length === 1}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ChartSurface>
          )}
        </div>
        <div className="@container/tiles flex min-w-0 flex-col gap-1 @3xl/overview:col-span-3">
          {GROUPS.map((group) => {
            const groupRows = rows.filter((row) => row.metric.group === group);
            if (groupRows.length === 0) return null;
            return (
              <section key={group} className="flex flex-col gap-1">
                <PanelSection variant="label" title={group} className="px-0 pt-1" />
                <div className="grid grid-cols-2 gap-1 @md/tiles:grid-cols-3 @xl/tiles:grid-cols-4">
                  {groupRows.map(({ metric, summary }) => (
                    <MetricTile
                      key={metric.key}
                      metric={metric}
                      summary={summary}
                      loading={loading}
                      selected={metric === selected}
                      onSelect={() => void setMetricKey(metric.key)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </PanelBody>
    </Panel>
  );
}

function MetricTile({
  metric,
  summary,
  loading,
  selected,
  onSelect,
}: {
  metric: TrendMetric;
  summary: MetricSummary;
  loading: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const { recent, previous } = summary;
  const { digits, scale = 1, unit } = metric.change;
  return (
    <Button
      variant="toggle"
      size="tile"
      aria-pressed={selected}
      onClick={onSelect}
      className="min-w-0 flex-col items-stretch gap-0.5 font-normal"
    >
      <span className="truncate text-xs">{metric.label}</span>
      <span className="flex items-baseline justify-between gap-1">
        {loading ? (
          <Skeleton className="h-5 w-12" />
        ) : (
          <span className="text-sm font-semibold text-foreground tabular-nums">
            {recent == null ? <NoValue label="No data" /> : metric.format(recent)}
          </span>
        )}
        {!loading && recent != null && previous != null && (
          <Delta
            value={(recent - previous) * scale}
            format="number"
            digits={digits}
            unit={unit}
            polarity={metric.polarity}
            className="text-xs"
          />
        )}
      </span>
    </Button>
  );
}

function TrendTooltip({
  active,
  payload,
  metric,
  window,
  overall,
}: {
  active?: boolean;
  payload?: { payload: MetricPoint }[];
  metric: TrendMetric;
  window: number;
  overall: number | null | undefined;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <TooltipCard>
      <TooltipHeader title={metric.label} subtitle={day.unix(point.time).format("MMM D, YYYY · HH:mm")} />
      <TooltipStats>
        <TooltipStat label={`Average of ${window}`} value={metric.format(point.value)} />
        <TooltipStat label="All selected" value={overall == null ? <NoValue /> : metric.format(overall)} />
      </TooltipStats>
    </TooltipCard>
  );
}
