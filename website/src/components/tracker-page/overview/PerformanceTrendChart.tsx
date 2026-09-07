import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { day } from "~/dayjs";
import type { PerformancePoint, TrackerSummary } from "~/lib/tracker/compute";

import { TREND_LINE_COLOR } from "../shared/colors";

type Metric = "winrate" | "kdaRatio" | "soulsPerMin";

interface MetricConfig {
  key: Metric;
  label: string;
  format: (value: number) => string;
  domain: [number | "auto", number | "auto"];
  ticks?: number[];
}

const METRICS: MetricConfig[] = [
  {
    key: "winrate",
    label: "Win rate",
    format: (value) => `${Math.round(value * 100)}%`,
    domain: [0, 1],
    ticks: [0, 0.25, 0.5, 0.75, 1],
  },
  { key: "kdaRatio", label: "KDA", format: (value) => value.toFixed(2), domain: [0, "auto"] },
  {
    key: "soulsPerMin",
    label: "Souls/min",
    format: (value) => Math.round(value).toLocaleString("en-US"),
    domain: ["auto", "auto"],
  },
];

function TrendTooltipContent({
  active,
  payload,
  metric,
  window,
}: {
  active?: boolean;
  payload?: { payload: PerformancePoint }[];
  metric: MetricConfig;
  window: number;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="text-sm font-semibold text-popover-foreground">{metric.format(point[metric.key])}</div>
      <div className="mt-0.5 text-muted-foreground">
        {metric.label} over matches {point.matchNumber - window + 1}–{point.matchNumber}
      </div>
      <div className="text-muted-foreground">{day.unix(point.time).format("MMM D, YYYY · HH:mm")}</div>
    </div>
  );
}

export function PerformanceTrendChart({
  points,
  window,
  summary,
}: {
  points: PerformancePoint[];
  window: number;
  summary: TrackerSummary;
}) {
  const [metricKey, setMetricKey] = useState<Metric>("winrate");
  const metric = METRICS.find((candidate) => candidate.key === metricKey) ?? METRICS[0];

  const dateByMatchNumber = useMemo(
    () => new Map(points.map((point) => [point.matchNumber, day.unix(point.time).format("MMM D")])),
    [points],
  );

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-base">Performance trend</CardTitle>
          <CardDescription>Rolling average over the last {window} matches</CardDescription>
        </div>
        <ToggleGroup
          type="single"
          value={metricKey}
          onValueChange={(value) => value && setMetricKey(value as Metric)}
          variant="outline"
          size="sm"
          aria-label="Performance metric"
        >
          {METRICS.map((candidate) => (
            <ToggleGroupItem key={candidate.key} value={candidate.key} className="text-xs">
              {candidate.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </CardHeader>
      <CardContent className="space-y-2">
        {points.length >= 2 && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: TREND_LINE_COLOR }} />
              Last {window} matches
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 border-t border-dashed border-muted-foreground" />
              Average {metric.format(summary[metric.key])}
            </span>
          </div>
        )}
        {points.length < 2 ? (
          <div className="flex h-[180px] items-center justify-center text-center text-sm text-muted-foreground">
            Play at least {window + 1} matches in the selected range to see a trend.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />
              <XAxis
                dataKey="matchNumber"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(value: number) => dateByMatchNumber.get(value) ?? ""}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                minTickGap={48}
              />
              <YAxis
                dataKey={metric.key}
                type="number"
                domain={metric.domain}
                ticks={metric.ticks}
                tickFormatter={metric.format}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                width={44}
              />
              <Tooltip
                cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
                content={<TrendTooltipContent metric={metric} window={window} />}
              />
              <ReferenceLine
                y={summary[metric.key]}
                stroke="var(--muted-foreground)"
                strokeDasharray="4 4"
                strokeOpacity={0.6}
              />
              <Area
                type="monotone"
                dataKey={metric.key}
                stroke={TREND_LINE_COLOR}
                strokeWidth={2}
                strokeLinecap="round"
                fill={TREND_LINE_COLOR}
                fillOpacity={0.1}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)", fill: TREND_LINE_COLOR }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
