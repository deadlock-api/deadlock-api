import type { PlayerMatchHistoryEntry } from "deadlock_api_client";
import { ChartNoAxesCombined } from "lucide-react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";

import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import {
  CHART_BASELINE,
  CHART_COLOR,
  CHART_CURSOR_LINE,
  CHART_GRID,
  CHART_X_AXIS_SM,
  SERIES_COLORS,
} from "~/components/patterns/charts/theme";
import { Panel, PanelBody, PanelHeader } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import {
  Tooltip as HoverTooltip,
  TooltipCard,
  TooltipHeader,
  TooltipStat,
  TooltipStats,
} from "~/components/ui/tooltip";
import { day } from "~/dayjs";
import { computePerformanceTrend, performanceWindow, type ResultFilter } from "~/lib/tracker/compute";

const metrics = {
  winrate: {
    label: "Win rate",
    color: CHART_COLOR.positive,
    format: (value: number) => `${(value * 100).toFixed(1)}%`,
    description: "Wins / matches. Dashed line: 50% win rate.",
  },
  kdaRatio: {
    label: "KDA",
    color: SERIES_COLORS[3],
    format: (value: number) => value.toFixed(2),
    description: "Total kills + assists / deaths in each window. With no deaths, shows kills + assists.",
  },
  soulsPerMin: {
    label: "Souls / min",
    color: SERIES_COLORS[2],
    format: (value: number) => Math.round(value).toLocaleString("en-US"),
    description: "Total souls / total minutes played in each window.",
  },
};
type Metric = keyof typeof metrics;
const metricKeys = Object.keys(metrics) as Metric[];
const windows = ["auto", "5", "10", "20", "50"] as const;

export function PerformanceTrendPanel({
  entries,
  result,
  className,
}: {
  entries: PlayerMatchHistoryEntry[];
  result: ResultFilter;
  className?: string;
}) {
  const [metric, setMetric] = useQueryState("trend_metric", parseAsStringLiteral(metricKeys).withDefault("winrate"));
  const [windowChoice, setWindowChoice] = useQueryState(
    "trend_window",
    parseAsStringLiteral(windows).withDefault("auto"),
  );
  const window = windowChoice === "auto" ? performanceWindow(entries.length) : Number(windowChoice);
  const points = useMemo(() => computePerformanceTrend(entries, window), [entries, window]);
  const selected = metrics[metric];
  const latest = points.at(-1);

  return (
    <Panel className={className}>
      <PanelHeader
        title="Performance trend"
        description={`Rolling ${window} matches`}
        icon={ChartNoAxesCombined}
        size="sm"
      />
      <PanelBody size="sm" className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-1">
          <Segmented size="sm" width="hug" value={metric} onValueChange={setMetric} aria-label="Performance metric">
            {metricKeys.map((key) => (
              <SegmentedItem key={key} value={key}>
                {metrics[key].label}
              </SegmentedItem>
            ))}
          </Segmented>
          <Segmented
            size="sm"
            width="hug"
            value={windowChoice}
            onValueChange={setWindowChoice}
            aria-label="Rolling window size"
          >
            {windows.map((choice) =>
              choice === "auto" ? (
                <HoverTooltip key={choice} content="Window grows with your selected match history">
                  <SegmentedItem value={choice} aria-label="Automatic window size">
                    Auto
                  </SegmentedItem>
                </HoverTooltip>
              ) : (
                <SegmentedItem key={choice} value={choice} aria-label={`${choice} matches`}>
                  {choice}
                </SegmentedItem>
              ),
            )}
          </Segmented>
        </div>
        <div className="flex flex-wrap items-baseline gap-2" aria-live="polite" aria-atomic="true">
          <span className="text-lg font-semibold tabular-nums">{latest ? selected.format(latest[metric]) : "—"}</span>
          <span className="text-3xs text-muted-foreground">
            {selected.label} · latest {window} selected matches
          </span>
        </div>
        {points.length === 0 ? (
          <EmptyState
            variant="inline"
            className="flex min-h-24 items-center justify-center py-0 text-xs"
            title={`${entries.length} of ${window} matches available. Choose a smaller window or broaden your filters.`}
          />
        ) : (
          <ChartSurface
            label={`Rolling ${window}-match ${selected.label.toLowerCase()} over selected matches`}
            size="sm"
            variant="bare"
          >
            <AreaChart
              data={points}
              margin={{ top: 4, right: 2, left: 2, bottom: 0 }}
              accessibilityLayer
              aria-label={`Rolling ${window}-match ${selected.label.toLowerCase()} over selected matches`}
            >
              <CartesianGrid {...CHART_GRID} />
              <XAxis
                {...CHART_X_AXIS_SM}
                dataKey="time"
                tickFormatter={(time: number) => day.unix(time).format("MMM D")}
                minTickGap={35}
              />
              <YAxis domain={metric === "winrate" ? [0, 1] : [0, "auto"]} hide />
              {metric === "winrate" && <ReferenceLine y={0.5} {...CHART_BASELINE} />}
              <Tooltip cursor={CHART_CURSOR_LINE} content={<PerformanceTooltip metric={metric} window={window} />} />
              <Area
                key={metric}
                dataKey={metric}
                type="monotone"
                stroke={selected.color}
                fill={selected.color}
                fillOpacity={0.12}
                strokeWidth={1.5}
                dot={points.length === 1}
                isAnimationActive={false}
              />
            </AreaChart>
          </ChartSurface>
        )}
        <p className="text-3xs text-muted-foreground">{selected.description}</p>
        {result !== "all" && (
          <p className="text-3xs text-muted-foreground">
            {result === "win" ? "Wins only" : "Losses only"}.
            {metric === "winrate"
              ? ` The ${result === "win" ? "100%" : "0%"} win rate reflects your result filter. Select All results to see your overall trend.`
              : " Statistics describe only these selected outcomes."}
          </p>
        )}
      </PanelBody>
    </Panel>
  );
}

function PerformanceTooltip({
  active,
  payload,
  metric,
  window,
}: {
  active?: boolean;
  payload?: { payload: ReturnType<typeof computePerformanceTrend>[number] }[];
  metric: Metric;
  window: number;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const selected = metrics[metric];
  return (
    <TooltipCard>
      <TooltipHeader title={selected.label} subtitle={day.unix(point.time).format("MMM D, YYYY · HH:mm")} />
      <TooltipStats>
        <TooltipStat label={selected.label} value={selected.format(point[metric])} />
        <TooltipStat label="Rolling window" value={`${window} matches`} />
      </TooltipStats>
    </TooltipCard>
  );
}
