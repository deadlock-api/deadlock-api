import type { HashMapValue } from "deadlock_api_client";
import { Area, AreaChart, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";

import { ChartReading, ChartReadings } from "~/components/patterns/charts/ChartReadings";
import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import { CHART_COLOR, CHART_CURSOR_LINE, CHART_TICK_SM } from "~/components/patterns/charts/theme";
import { approxPercentile, formatPercentile, percentilePoints } from "~/lib/distribution-percentile";

export interface CurvePoint {
  x: number;
  y: number;
}

/**
 * Approximates a KDE-style density curve from percentile summary stats (no raw samples
 * are available). Each bin between adjacent percentiles gets a density = probability
 * mass / bin width, plotted at the bin midpoint; Recharts' monotone curve smooths
 * between those points into a continuous silhouette.
 */
export function buildDistributionCurve(values: HashMapValue): CurvePoint[] {
  const points = percentilePoints(values);
  const curve: CurvePoint[] = [{ x: Math.min(0, values.percentile1), y: 0 }];
  for (let i = 0; i < points.length - 1; i++) {
    const width = points[i + 1].v - points[i].v;
    if (width <= 0) continue;
    const share = (points[i + 1].p - points[i].p) / 100;
    curve.push({ x: (points[i].v + points[i + 1].v) / 2, y: share / width });
  }
  curve.push({ x: Math.max(values.percentile99, values.avg) * 1.05 || 1, y: 0 });
  return curve;
}

function DistributionTooltip({
  payload,
  label,
  values,
  fmt,
}: {
  payload?: { payload: CurvePoint }[];
  label: string;
  values: HashMapValue;
  fmt: (v: number) => string;
}) {
  if (!payload?.length) return null;
  const { x } = payload[0].payload;
  return (
    <ChartReadings title={label}>
      <ChartReading label="Value">{fmt(x)}</ChartReading>
      <ChartReading label="Percentile">{formatPercentile(approxPercentile(values, x))}</ChartReading>
    </ChartReadings>
  );
}

/** What the plot shows, for a reader who cannot see it: the chart's name and the numbers its lines mark. */
function distributionSummary(label: string, values: HashMapValue, fmt: (v: number) => string): string {
  return (
    `${label} distribution: average ${fmt(values.avg)}, median ${fmt(values.percentile50)}, ` +
    `middle half of players (P25 to P75) ${fmt(values.percentile25)} to ${fmt(values.percentile75)}.`
  );
}

export function DistributionChart({
  label,
  curve,
  values,
  fmt,
  height,
}: {
  /** The metric's name, "Kills": it heads the tooltip and the chart's accessible summary. */
  label: string;
  curve: CurvePoint[];
  values: HashMapValue;
  fmt: (v: number) => string;
  height: number;
}) {
  const domainMin = curve[0]?.x ?? 0;
  const domainMax = curve[curve.length - 1]?.x ?? 1;
  // A metric that is mostly zero has its median on the minimum; a repeated tick prints twice and collides as a key.
  const ticks = [...new Set([domainMin, values.percentile50, domainMax])];

  return (
    <div style={{ height }}>
      {/* Read piecemeal, the tick labels ran together into "0.06.022.2"; the summary says what the lines mark. */}
      <ChartSurface label={distributionSummary(label, values, fmt)} announce="label" size="fill" variant="bare">
        <AreaChart data={curve} margin={{ top: 4, right: 16, bottom: 0, left: 16 }} accessibilityLayer={false}>
          <XAxis
            type="number"
            dataKey="x"
            domain={["dataMin", "dataMax"]}
            ticks={ticks}
            tickFormatter={(v) => fmt(v as number)}
            tick={CHART_TICK_SM}
            tickLine={false}
            axisLine={{ stroke: "var(--chart-grid)" }}
          />
          <YAxis type="number" domain={[0, "dataMax"]} hide />
          <Tooltip
            cursor={CHART_CURSOR_LINE}
            content={(props) => (
              <DistributionTooltip
                payload={props.payload as unknown as { payload: CurvePoint }[]}
                label={label}
                values={values}
                fmt={fmt}
              />
            )}
          />
          <ReferenceLine x={values.percentile25} stroke="var(--chart-axis)" strokeDasharray="2 2" strokeWidth={1} />
          <ReferenceLine
            x={values.percentile50}
            stroke="var(--muted-foreground)"
            strokeDasharray="2 2"
            strokeWidth={1}
          />
          <ReferenceLine x={values.percentile75} stroke="var(--chart-axis)" strokeDasharray="2 2" strokeWidth={1} />
          <ReferenceLine x={values.avg} stroke={CHART_COLOR.primary} strokeDasharray="3 3" strokeWidth={1.5} />
          <Area
            type="monotone"
            dataKey="y"
            stroke={CHART_COLOR.primary}
            strokeWidth={1.5}
            fill={CHART_COLOR.primary}
            fillOpacity={0.25}
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartSurface>
    </div>
  );
}
