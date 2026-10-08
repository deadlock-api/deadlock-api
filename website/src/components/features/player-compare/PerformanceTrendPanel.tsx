import { ChartNoAxesCombined } from "lucide-react";
import { useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";

import { ChartLegend, ChartLegendItem } from "~/components/patterns/charts/ChartLegend";
import { ChartReading, ChartReadings } from "~/components/patterns/charts/ChartReadings";
import { ChartError, ChartLoading } from "~/components/patterns/charts/ChartStates";
import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import { MetricSelect } from "~/components/patterns/charts/MetricSelect";
import {
  CHART_BASELINE,
  CHART_CURSOR_LINE,
  CHART_GRID,
  CHART_MARGIN,
  CHART_X_AXIS,
  CHART_Y_AXIS,
  CHART_ACTIVE_DOT,
  CHART_COLOR,
} from "~/components/patterns/charts/theme";
import { Panel, PanelBody, PanelHeader } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { NoValue } from "~/components/ui/no-value";
import { SelectItem } from "~/components/ui/select";
import { Stack } from "~/components/ui/stack";
import { day } from "~/dayjs";
import { formatCompactAxisTick, niceTicks, percentTicks, winRateDomain } from "~/lib/chart-axis";
import {
  MIN_WEEK_MATCHES,
  mergeWeeklyTrend,
  trendMetricsFor,
  type TrendMetric,
  type TrendRow,
  weeklyTotals,
  trendBucketWeeks,
  weekTicks,
} from "~/lib/compare-trends";
import { formatPercent } from "~/lib/format";
import type { GameMode } from "~/lib/game-mode";
import { formatStatValue } from "~/lib/stat-format";

import type { ComparedPlayer } from "./types";
import type { CompareMatchHistory } from "./useCompareMatchHistories";

const LABEL = "weekly trend";
const shortDate = (unix: number) => day.unix(unix).utc().format("MMM D");
const longDate = (unix: number) => day.unix(unix).utc().format("MMM D, YYYY");

const METRICS: Record<TrendMetric, { short: string; label: string; format: (value: number) => string }> = {
  winRate: { short: "Win rate", label: "Win rate", format: (value) => formatPercent(value) },
  kda: { short: "KDA", label: "KDA", format: (value) => value.toFixed(2) },
  kills: { short: "Kills", label: "Kills per match", format: (value) => value.toFixed(1) },
  deaths: { short: "Deaths", label: "Deaths per match", format: (value) => value.toFixed(1) },
  soulsPerMin: {
    short: "Souls/min",
    label: "Souls per minute",
    format: (value) => formatStatValue(value, "integer"),
  },
  lastHitsPerMin: { short: "Last hits/min", label: "Last hits per minute", format: (value) => value.toFixed(1) },
};

/** Every compared player's weekly win rate, KDA, kills, deaths or farm across the page's dates, one line each. */
export function PerformanceTrendPanel({
  players,
  histories,
  gameMode,
  className,
}: {
  players: ComparedPlayer[];
  /** Street Brawl has no soul economy: no souls trend. */
  gameMode: GameMode;
  /** The players' match histories on the filters, in the players' order (`useCompareMatchHistories`). */
  histories: readonly CompareMatchHistory[];
  /** Layout from the parent (grid placement). */
  className?: string;
}) {
  const [chosenMetric, setMetric] = useState<TrendMetric>("winRate");
  const metrics = trendMetricsFor(gameMode);
  // Souls per minute, chosen before switching to Street Brawl, falls back to the win rate; the choice comes back with
  // the mode.
  const metric = metrics.includes(chosenMetric) ? chosenMetric : "winRate";
  // Hidden once loaded when no player has a week with enough matches to plot.
  const settled = !histories.some((history) => history.isPending);
  const allFailed = histories.length > 0 && histories.every((history) => history.isError);
  // A long range sums blocks of weeks, so the lines stay readable (about 26 points at most).
  // The span of every player's matches, in a loop: spreading tens of thousands of start times would overflow the stack.
  let firstStart = Infinity;
  let lastStart = -Infinity;
  for (const history of histories) {
    for (const match of history.heroMatches ?? []) {
      if (match.start_time < firstStart) firstStart = match.start_time;
      if (match.start_time > lastStart) lastStart = match.start_time;
    }
  }
  const bucket = firstStart <= lastStart ? trendBucketWeeks(firstStart, lastStart) : 1;
  // Summed once per render and shared with the chart: up to five histories of thousands of matches.
  // On the page's hero, as the head-to-head.
  const weeksByPlayer = histories.map((history) => weeklyTotals(history.heroMatches ?? [], bucket));
  const plottable = mergeWeeklyTrend(
    histories.map((history, index) => ({ key: String(history.accountId), weeks: weeksByPlayer[index] })),
    "winRate",
    MIN_WEEK_MATCHES,
    bucket,
  );
  if (settled && !allFailed && plottable.length === 0) return null;

  return (
    <Panel className={className}>
      <PanelHeader size="sm" title={bucket === 1 ? "Weekly trend" : `${bucket}-week trend`} icon={ChartNoAxesCombined}>
        {/* One line, like the rank chart's header beside it, so the two plots start level. */}
        <MetricSelect
          value={metric}
          valueLabel={METRICS[metric].label}
          onValueChange={(next) => setMetric(next as TrendMetric)}
          label="Trend metric"
          className="w-auto @sm:min-w-40"
        >
          {metrics.map((key) => (
            <SelectItem key={key} value={key}>
              {METRICS[key].label}
            </SelectItem>
          ))}
        </MetricSelect>
      </PanelHeader>
      {/* The plot takes whatever height its grid row gives the panel, from a compact minimum. */}
      <PanelBody size="sm" className="flex flex-1 flex-col">
        <Stack gap={2} className="flex-1">
          {histories.length > 0 && histories.every((history) => history.isError) ? (
            <ChartError
              label={LABEL}
              onRetry={() => {
                for (const history of histories) if (history.isError) history.refetch();
              }}
            />
          ) : histories.some((history) => history.isPending) ? (
            <ChartLoading label={LABEL} size="grow" />
          ) : (
            <PerformanceTrendChart players={players} metric={metric} weeksByPlayer={weeksByPlayer} bucket={bucket} />
          )}
          <ChartLegend label="Players">
            {players.map((player) => (
              <ChartLegendItem key={player.accountId} color={player.color} shape="line" title={player.name}>
                <span className="max-w-full truncate">{player.name}</span>
              </ChartLegendItem>
            ))}
          </ChartLegend>
        </Stack>
      </PanelBody>
    </Panel>
  );
}

function PerformanceTrendChart({
  players,
  metric,
  weeksByPlayer,
  bucket,
}: {
  players: ComparedPlayer[];
  metric: TrendMetric;
  weeksByPlayer: ReturnType<typeof weeklyTotals>[];
  /** Weeks summed into each point. */
  bucket: number;
}) {
  const selected = METRICS[metric];
  const keys = players.map((player) => String(player.accountId));
  const rows = mergeWeeklyTrend(
    keys.map((key, index) => ({ key, weeks: weeksByPlayer[index] ?? [] })),
    metric,
    MIN_WEEK_MATCHES,
    bucket,
  );
  const period = bucket === 1 ? "week" : `${bucket} weeks`;
  const first = rows[0];
  const last = rows.at(-1);

  if (!first || !last) {
    return (
      <EmptyState
        variant="plain"
        icon={ChartNoAxesCombined}
        title={`No week with ${MIN_WEEK_MATCHES} or more matches`}
        className="min-h-32 flex-1"
      />
    );
  }

  const values = rows.flatMap((row) => keys.flatMap((key) => (row.value[key] == null ? [] : [row.value[key]])));
  const axis = yAxis(metric, values);
  const latest = players.map((player, index) => {
    const key = keys[index];
    const row = rows.findLast((candidate) => candidate.value[key] != null);
    return row
      ? `${player.name} ${selected.format(row.value[key] ?? 0)} in the ${period} from ${longDate(row.week)}`
      : `${player.name} no week with ${MIN_WEEK_MATCHES} or more matches`;
  });
  const summary = `${selected.label} by ${period} (UTC), from ${longDate(first.week)} to ${longDate(last.week)}, periods with ${MIN_WEEK_MATCHES} or more matches. Latest: ${latest.join("; ")}.`;

  return (
    <ChartSurface label={summary} announce="label" size="grow" variant="flush">
      <LineChart data={rows} margin={CHART_MARGIN} accessibilityLayer={false}>
        <CartesianGrid {...CHART_GRID} />
        <XAxis
          {...CHART_X_AXIS}
          dataKey="week"
          type="number"
          domain={[first.week, last.week]}
          ticks={weekTicks(first.week, last.week)}
          tickFormatter={shortDate}
          minTickGap={24}
        />
        <YAxis
          {...CHART_Y_AXIS}
          type="number"
          domain={axis.domain}
          ticks={axis.ticks}
          interval={0}
          tickFormatter={axis.format}
        />
        {metric === "winRate" && <ReferenceLine y={0.5} {...CHART_BASELINE} />}
        <Tooltip
          cursor={CHART_CURSOR_LINE}
          isAnimationActive={false}
          wrapperStyle={{ pointerEvents: "auto" }}
          content={({ active, payload }) => {
            const row = payload?.[0]?.payload as TrendRow | undefined;
            if (!active || !row) return null;
            return (
              <ChartReadings
                title={
                  bucket === 1
                    ? `Week of ${longDate(row.week)} (UTC)`
                    : `${shortDate(row.week)} – ${longDate(row.week + bucket * 7 * 86_400 - 86_400)} (UTC)`
                }
                valueLabel={selected.short}
                extraLabel="Matches"
                label={`${selected.label} in this week`}
              >
                {players.map((player, index) => {
                  const key = keys[index];
                  const value = row.value[key];
                  return (
                    <ChartReading
                      key={player.accountId}
                      label={player.name}
                      color={player.color}
                      extra={row.matches[key] ?? 0}
                    >
                      {value == null ? <NoValue /> : selected.format(value)}
                    </ChartReading>
                  );
                })}
              </ChartReadings>
            );
          }}
        />
        {players.map((player, index) => {
          const key = keys[index];
          return (
            <Line
              key={key}
              name={player.name}
              dataKey={(row: TrendRow) => row.value[key]}
              type="linear"
              stroke={player.color}
              strokeWidth={2}
              isAnimationActive={false}
              activeDot={CHART_ACTIVE_DOT}
              dot={({
                cx,
                cy,
                index: at,
                payload,
              }: {
                cx?: number;
                cy?: number;
                index?: number;
                payload?: TrendRow;
              }) =>
                payload?.lone[key] && cx != null && cy != null ? (
                  <circle
                    key={at}
                    cx={cx}
                    cy={cy}
                    r={4}
                    fill={player.color}
                    stroke={CHART_COLOR.surface}
                    strokeWidth={2}
                  />
                ) : (
                  <g key={at} />
                )
              }
            />
          );
        })}
      </LineChart>
    </ChartSurface>
  );
}

/** Round ticks for the metric: whole 5% steps around 50% for the win rate, 1/2/5 steps for the rest. */
function yAxis(
  metric: TrendMetric,
  values: number[],
): { domain: [number, number]; ticks: number[]; format: (value: number) => string } {
  if (metric === "winRate") {
    const domain = winRateDomain([...values, 0.5]);
    // At most four labels: the plot grows from a short minimum, where five would crowd.
    const ticks = percentTicks(domain);
    return {
      domain,
      ticks: ticks.length > 4 ? ticks.filter((_, index) => index % 2 === 0) : ticks,
      format: (value) => formatPercent(value, 0),
    };
  }
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  // One value (a single week, or equal weeks) still gets a span to sit in.
  const ticks = niceTicks(lo, hi > lo ? hi : lo + Math.max(1, Math.abs(lo) * 0.1), 3);
  const step = ticks.length > 1 ? ticks[1] - ticks[0] : 1;
  return {
    domain: [ticks[0], ticks.at(-1) ?? ticks[0]],
    ticks,
    format: (value) => formatCompactAxisTick(value, step),
  };
}
