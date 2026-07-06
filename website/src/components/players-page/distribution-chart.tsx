import type { HashMapValue } from "deadlock_api_client";
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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
    <div
      className="rounded border border-[#1a1a1a] px-2.5 py-1.5 text-xs"
      style={{ backgroundColor: "#0a0a0a", opacity: 1 }}
    >
      <span className="text-[#e5e5e5]">{fmt(payload[0].payload.x)}</span>
    </div>
  );
}

export function DistributionChart({
  curve,
  values,
  fmt,
  height,
}: {
  curve: CurvePoint[];
  values: HashMapValue;
  fmt: (v: number) => string;
  height: number;
}) {
  const domainMin = curve[0]?.x ?? 0;
  const domainMax = curve[curve.length - 1]?.x ?? 1;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={curve} margin={{ top: 4, right: 16, bottom: 0, left: 16 }}>
        <XAxis
          type="number"
          dataKey="x"
          domain={["dataMin", "dataMax"]}
          ticks={[domainMin, values.percentile50, domainMax]}
          tickFormatter={(v) => fmt(v as number)}
          tick={{ fontSize: 9, fill: "#737373" }}
          tickLine={false}
          axisLine={{ stroke: "#525252" }}
        />
        <YAxis type="number" domain={[0, "dataMax"]} hide />
        <Tooltip
          cursor={{ stroke: "#525252", strokeWidth: 1 }}
          content={(props) => (
            <DistributionTooltip payload={props.payload as unknown as { payload: CurvePoint }[]} fmt={fmt} />
          )}
        />
        <ReferenceLine x={values.percentile25} stroke="#737373" strokeDasharray="2 2" strokeWidth={1} />
        <ReferenceLine x={values.percentile50} stroke="#a3a3a3" strokeDasharray="2 2" strokeWidth={1} />
        <ReferenceLine x={values.percentile75} stroke="#737373" strokeDasharray="2 2" strokeWidth={1} />
        <ReferenceLine x={values.avg} stroke="var(--color-primary)" strokeDasharray="3 3" strokeWidth={1.5} />
        <Area
          type="monotone"
          dataKey="y"
          stroke="var(--color-primary)"
          strokeWidth={1.5}
          fill="var(--color-primary)"
          fillOpacity={0.25}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
