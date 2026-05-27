import {
  Area,
  AreaChart as RAreaChart,
  Bar,
  BarChart as RBarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart as RLineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart as RRadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type {
  AreaChartBlock,
  BarChartBlock,
  ChartSeries,
  LineChartBlock,
  NetWorthChartBlock,
  RadarChartBlock,
  WinProbabilityChartBlock,
} from "~/lib/coach/report";
import { CHART_PALETTE, toneColor } from "~/lib/coach/tones";

import { BlockHeading, CoachCard, formatClock } from "./shared";

const AXIS = { fontSize: 11, fill: "var(--muted-foreground)" } as const;

function seriesColor(s: ChartSeries, i: number): string {
  return s.color ?? CHART_PALETTE[i % CHART_PALETTE.length];
}

function ChartTip({
  active,
  payload,
  label,
  isTime,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string }>;
  label?: number | string;
  isTime?: boolean;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-[#0d1117]/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      <p className="mb-1 font-medium text-foreground">
        {isTime && typeof label === "number" ? formatClock(label) : label}
      </p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="size-2 rounded-sm" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ml-auto font-medium text-foreground tabular-nums">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

function ChartFrame({
  title,
  subtitle,
  children,
}: {
  title?: string | null;
  subtitle?: string | null;
  children: React.ReactNode;
}) {
  return (
    <CoachCard>
      <BlockHeading title={title} subtitle={subtitle} />
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 600, height: 256 }}>
          {children}
        </ResponsiveContainer>
      </div>
    </CoachCard>
  );
}

export function LineChart({ block }: { block: LineChartBlock }) {
  const xKey = block.x_key ?? "t";
  return (
    <ChartFrame title={block.title} subtitle={block.subtitle}>
      <RLineChart data={block.data} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
        <XAxis
          dataKey={xKey}
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          tickFormatter={block.x_is_time ? (v) => formatClock(Number(v)) : undefined}
        />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} />
        <Tooltip content={<ChartTip isTime={block.x_is_time} />} />
        {block.series.length > 1 ? <Legend wrapperStyle={{ fontSize: 11 }} /> : null}
        {(block.annotations ?? []).map((a, i) => (
          <ReferenceLine
            key={i}
            x={a.x}
            stroke={toneColor(a.tone ?? "accent")}
            strokeDasharray="4 3"
            label={{ value: a.label, fontSize: 10, fill: toneColor(a.tone ?? "accent"), position: "top" }}
          />
        ))}
        {block.series.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={seriesColor(s, i)}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </RLineChart>
    </ChartFrame>
  );
}

export function AreaChart({ block }: { block: AreaChartBlock }) {
  const xKey = block.x_key ?? "t";
  return (
    <ChartFrame title={block.title} subtitle={block.subtitle}>
      <RAreaChart data={block.data} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
        <defs>
          {block.series.map((s, i) => (
            <linearGradient key={s.key} id={`grad-${s.key}-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={seriesColor(s, i)} stopOpacity={0.4} />
              <stop offset="100%" stopColor={seriesColor(s, i)} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
        <XAxis
          dataKey={xKey}
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          tickFormatter={block.x_is_time ? (v) => formatClock(Number(v)) : undefined}
        />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} />
        <Tooltip content={<ChartTip isTime={block.x_is_time} />} />
        {block.series.length > 1 ? <Legend wrapperStyle={{ fontSize: 11 }} /> : null}
        {(block.annotations ?? []).map((a, i) => (
          <ReferenceLine key={i} x={a.x} stroke={toneColor(a.tone ?? "accent")} strokeDasharray="4 3" />
        ))}
        {block.series.map((s, i) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={seriesColor(s, i)}
            strokeWidth={2}
            fill={`url(#grad-${s.key}-${i})`}
            stackId={block.stacked ? "stack" : undefined}
          />
        ))}
      </RAreaChart>
    </ChartFrame>
  );
}

export function BarChart({ block }: { block: BarChartBlock }) {
  const xKey = block.x_key ?? "label";
  const horizontal = block.horizontal;
  return (
    <ChartFrame title={block.title} subtitle={block.subtitle}>
      <RBarChart
        data={block.data}
        layout={horizontal ? "vertical" : "horizontal"}
        margin={{ top: 8, right: 12, bottom: 4, left: horizontal ? 8 : -8 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--border)"
          strokeOpacity={0.4}
          horizontal={!horizontal}
          vertical={horizontal}
        />
        {horizontal ? (
          <>
            <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey={xKey} tick={AXIS} tickLine={false} axisLine={false} width={90} />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={false} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} />
          </>
        )}
        <Tooltip content={<ChartTip />} cursor={{ fill: "var(--muted)", fillOpacity: 0.3 }} />
        {block.series.length > 1 ? <Legend wrapperStyle={{ fontSize: 11 }} /> : null}
        {block.series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            fill={seriesColor(s, i)}
            radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
            stackId={block.stacked ? "stack" : undefined}
            maxBarSize={48}
          />
        ))}
      </RBarChart>
    </ChartFrame>
  );
}

export function RadarChart({ block }: { block: RadarChartBlock }) {
  // recharts radar wants one row per axis with a column per series.
  const data = block.axes.map((axis) => {
    const row: Record<string, number | string> = { axis: axis.label };
    for (const s of block.series) {
      const found = block.data.find((d) => d[s.key] != null && (d.axis === axis.key || d.axis === axis.label));
      row[s.key] = found ? (found[s.key] as number) : 0;
    }
    return row;
  });
  return (
    <ChartFrame title={block.title} subtitle={block.subtitle}>
      <RRadarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
        <PolarGrid stroke="var(--border)" strokeOpacity={0.5} />
        <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
        <PolarRadiusAxis tick={false} axisLine={false} />
        <Tooltip content={<ChartTip />} />
        {block.series.length > 1 ? <Legend wrapperStyle={{ fontSize: 11 }} /> : null}
        {block.series.map((s, i) => (
          <Radar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            stroke={seriesColor(s, i)}
            fill={seriesColor(s, i)}
            fillOpacity={0.18}
            strokeWidth={2}
          />
        ))}
      </RRadarChart>
    </ChartFrame>
  );
}

// Preset: net worth over time. The agent just supplies points {t, you, enemy?}.
export function NetWorthChart({ block }: { block: NetWorthChartBlock }) {
  const hasEnemy = block.points.some((p) => p.enemy != null);
  return (
    <ChartFrame title={block.title ?? "Net worth over time"} subtitle={block.subtitle}>
      <RAreaChart data={block.points} margin={{ top: 8, right: 12, bottom: 4, left: -4 }}>
        <defs>
          <linearGradient id="nw-you" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fa4454" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#fa4454" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
        <XAxis
          dataKey="t"
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => formatClock(Number(v))}
        />
        <YAxis
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          width={48}
          tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
        />
        <Tooltip content={<ChartTip isTime />} />
        {hasEnemy ? <Legend wrapperStyle={{ fontSize: 11 }} /> : null}
        {(block.annotations ?? []).map((a, i) => (
          <ReferenceLine
            key={i}
            x={a.x}
            stroke={toneColor(a.tone ?? "accent")}
            strokeDasharray="4 3"
            label={{ value: a.label, fontSize: 10, fill: toneColor(a.tone ?? "accent"), position: "top" }}
          />
        ))}
        {hasEnemy ? (
          <Area
            type="monotone"
            dataKey="enemy"
            name={block.enemy_label ?? "Lane rival"}
            stroke="#8b949e"
            strokeWidth={2}
            fill="transparent"
          />
        ) : null}
        <Area
          type="monotone"
          dataKey="you"
          name={block.you_label ?? "You"}
          stroke="#fa4454"
          strokeWidth={2}
          fill="url(#nw-you)"
        />
      </RAreaChart>
    </ChartFrame>
  );
}

// Preset: win-chance curve, 0..1 with a 50% midline and optional swing markers.
// Every match opens 50/50 at 0:00, and the model only starts predicting a few
// minutes in, so we always anchor the curve at (t=0, p=0.5) regardless of where
// the supplied trajectory begins.
export function WinProbabilityChart({ block }: { block: WinProbabilityChartBlock }) {
  const points = [{ t: 0, p: 0.5 }, ...block.points.filter((pt) => pt.t > 0)];
  return (
    <ChartFrame title={block.title ?? "Win chance"} subtitle={block.subtitle}>
      {/* top margin leaves room for swing labels (position: top); left:0 keeps
          the full y-axis width on-canvas so the % ticks aren't clipped. */}
      <RAreaChart data={points} margin={{ top: 24, right: 16, bottom: 4, left: 0 }}>
        <defs>
          <linearGradient id="wp-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#fa4454" stopOpacity={0.08} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
        <XAxis
          dataKey="t"
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => formatClock(Number(v))}
        />
        <YAxis
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          width={40}
          domain={[0, 1]}
          tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`}
        />
        <Tooltip content={<ChartTip isTime />} />
        <ReferenceLine y={0.5} stroke="var(--border)" strokeDasharray="4 4" />
        {(block.swings ?? []).map((a, i) => (
          <ReferenceLine
            key={i}
            x={a.x}
            stroke={toneColor(a.tone ?? "accent")}
            strokeDasharray="4 3"
            label={{ value: a.label, fontSize: 10, fill: toneColor(a.tone ?? "accent"), position: "top" }}
          />
        ))}
        <Area type="monotone" dataKey="p" name="Win chance" stroke="#fa4454" strokeWidth={2} fill="url(#wp-area)" />
      </RAreaChart>
    </ChartFrame>
  );
}
