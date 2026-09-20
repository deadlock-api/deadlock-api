import type { HashMapValue } from "deadlock_api_client";
import { Area, AreaChart, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";

import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import { CHART_COLOR, CHART_CURSOR_LINE, CHART_TICK_SM } from "~/components/patterns/charts/theme";
import { TooltipCard } from "~/components/ui/tooltip";

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
  const points: { p: number; v: number }[] = [
    { p: 1, v: values.percentile1 },
    { p: 5, v: values.percentile5 },
    { p: 10, v: values.percentile10 },
    { p: 25, v: values.percentile25 },
    { p: 50, v: values.percentile50 },
    { p: 75, v: values.percentile75 },
    { p: 90, v: values.percentile90 },
    { p: 95, v: values.percentile95 },
    { p: 99, v: values.percentile99 },
  ];
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

function DistributionTooltip({ payload, fmt }: { payload?: { payload: CurvePoint }[]; fmt: (v: number) => string }) {
  if (!payload?.length) return null;
  return (
    <TooltipCard className="px-2.5 py-1.5 text-xs">
      <span className="tabular-nums">{fmt(payload[0].payload.x)}</span>
    </TooltipCard>
  );
}

export function DistributionChart({
  label,
  curve,
  values,
  fmt,
  height,
}: {
  label: string;
  curve: CurvePoint[];
  values: HashMapValue;
  fmt: (v: number) => string;
  height: number;
}) {
  const domainMin = curve[0]?.x ?? 0;
  const domainMax = curve[curve.length - 1]?.x ?? 1;

  return (
    <div style={{ height }}>
      <ChartSurface label={label} size="fill" variant="bare">
        <AreaChart data={curve} margin={{ top: 4, right: 16, bottom: 0, left: 16 }}>
          <XAxis
            type="number"
            dataKey="x"
            domain={["dataMin", "dataMax"]}
            ticks={[domainMin, values.percentile50, domainMax]}
            tickFormatter={(v) => fmt(v as number)}
            tick={CHART_TICK_SM}
            tickLine={false}
            axisLine={{ stroke: "var(--chart-grid)" }}
          />
          <YAxis type="number" domain={[0, "dataMax"]} hide />
          <Tooltip
            cursor={CHART_CURSOR_LINE}
            content={(props) => (
              <DistributionTooltip payload={props.payload as unknown as { payload: CurvePoint }[]} fmt={fmt} />
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
