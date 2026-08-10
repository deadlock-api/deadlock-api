import { useId } from "react";
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { LaneSoulPoint } from "~/lib/team-builder/analysis";
import { BAD_RGB, compactNumber, deltaBarColor, deltaClass, formatCount, GOOD_RGB } from "~/lib/team-builder/format";
import { cn } from "~/lib/utils";

/** Floor on the axis, so a 40-soul wobble is not drawn with the same drama as a 900-soul rout. */
const SOUL_FLOOR = 800;

const minuteLabel = (timeS: number) => `${Math.round(timeS / 60)}′`;

const signedSouls = (diff: number) => `${diff >= 0 ? "+" : ""}${formatCount(Math.round(diff))}`;

const axisSouls = (value: number) => (value === 0 ? "0" : `${value > 0 ? "+" : "−"}${compactNumber(Math.abs(value))}`);

/** Recharts' default tick colour is far too dark to read against the card. */
const TICK = { fontSize: 10, fill: "var(--color-muted-foreground)" } as const;

/** Coloured by its own sign, which the gradient stroke cannot do for a mark this small. */
function SoulDot({ cx, cy, payload }: { cx?: number; cy?: number; payload?: LaneSoulPoint }) {
  if (cx === undefined || cy === undefined || !payload) return null;
  return <circle cx={cx} cy={cy} r={2.5} fill={deltaBarColor(payload.diff)} />;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/**
 * Where the even line falls inside a shape's own bounding box, as a fraction from its top.
 *
 * An SVG gradient resolves against the bounding box of the shape it paints, not against the chart's
 * axes, so a fixed 50% stop paints an all-positive series half red. The area's box runs
 * `min(dataMin, 0)`..`max(dataMax, 0)`; the stroke's box is the curve's own extent.
 */
const zeroOffset = (top: number, bottom: number) => (top <= bottom ? 1 : clamp01(top / (top - bottom)));

/** Expects at least two points; the caller shows its own empty state below that. */
export function LaneSoulCurve({ points }: { points: LaneSoulPoint[] }) {
  const gradientId = useId();
  const diffs = points.map((p) => p.diff);
  const dataMax = Math.max(...diffs);
  const dataMin = Math.min(...diffs);
  // The band, not just the line, has to fit: a domain fitted to the mean alone clips its own error.
  const extent = Math.max(...points.map((p) => Math.max(Math.abs(p.lo), Math.abs(p.hi))));
  const bound = Math.max(SOUL_FLOOR, Math.ceil(extent / 100) * 100);
  const band = points.map((p) => ({ ...p, range: [p.lo, p.hi] as [number, number] }));
  const fillOffset = zeroOffset(Math.max(dataMax, 0), Math.min(dataMin, 0));
  const strokeOffset = zeroOffset(dataMax, dataMin);
  const fillId = `${gradientId}-fill`;
  const strokeId = `${gradientId}-stroke`;

  return (
    <figure
      className="h-full"
      aria-label={`Mean soul lead: ${points.map((p) => `${minuteLabel(p.timeS)} ${signedSouls(p.diff)}`).join(", ")}`}
    >
      <ResponsiveContainer width="100%" height="100%" minHeight={72} className="[&_*]:outline-none">
        <AreaChart data={band} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset={fillOffset} stopColor={`rgb(${GOOD_RGB})`} stopOpacity={0.22} />
              <stop offset={fillOffset} stopColor={`rgb(${BAD_RGB})`} stopOpacity={0.22} />
            </linearGradient>
            <linearGradient id={strokeId} x1="0" y1="0" x2="0" y2="1">
              <stop offset={strokeOffset} stopColor={`rgb(${GOOD_RGB})`} />
              <stop offset={strokeOffset} stopColor={`rgb(${BAD_RGB})`} />
            </linearGradient>
          </defs>

          <XAxis
            dataKey="timeS"
            type="number"
            domain={[points[0].timeS, points[points.length - 1].timeS]}
            ticks={points.map((p) => p.timeS)}
            tickFormatter={minuteLabel}
            tick={TICK}
            tickLine={false}
            axisLine={false}
            height={16}
            interval="preserveStartEnd"
            minTickGap={2}
          />
          <YAxis
            orientation="right"
            domain={[-bound, bound]}
            ticks={[-bound, 0, bound]}
            tickFormatter={axisSouls}
            tick={TICK}
            tickLine={false}
            axisLine={false}
            width={32}
          />
          <ReferenceLine y={0} stroke="rgba(255,255,255,.28)" strokeDasharray="2 3" />

          {/* Drawn first so the mean and its dots sit on top of their own interval. */}
          <Area
            type="monotone"
            dataKey="range"
            fill="rgba(255,255,255,.18)"
            stroke="rgba(255,255,255,.35)"
            strokeWidth={1}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
            legendType="none"
          />
          <Area
            type="monotone"
            dataKey="diff"
            baseValue={0}
            fill={`url(#${fillId})`}
            stroke={`url(#${strokeId})`}
            strokeWidth={2}
            dot={<SoulDot />}
            activeDot={{ r: 4, strokeWidth: 0 }}
            isAnimationActive={false}
          />

          <Tooltip
            cursor={{ stroke: "rgba(255,255,255,.2)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0].payload as LaneSoulPoint;
              const ahead = point.diff >= 0;
              return (
                <div className="min-w-40 rounded-md border border-border bg-popover px-2.5 py-2 text-[11px] shadow-md">
                  <div className="mb-1.5 border-b border-border pb-1 font-semibold">
                    {Math.round(point.timeS / 60)} minutes in
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-muted-foreground">{ahead ? "Your duo ahead" : "Your duo behind"}</span>
                    <span className={cn("font-bold tabular-nums", deltaClass(point.diff))}>
                      {signedSouls(point.diff)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-baseline justify-between gap-3">
                    <span className="text-muted-foreground">95% confidence</span>
                    <span className="tabular-nums">
                      {signedSouls(point.lo)} … {signedSouls(point.hi)}
                    </span>
                  </div>
                  {point.lo < 0 && point.hi > 0 && (
                    <div className="mt-1 text-[10px] text-muted-foreground">Too close to call at this sample size</div>
                  )}
                </div>
              );
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </figure>
  );
}
