import { useId } from "react";
import { Area, AreaChart, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";

import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import { CHART_AXIS_SM, CHART_BASELINE, CHART_COLOR, CHART_CURSOR_LINE } from "~/components/patterns/charts/theme";
import { TooltipCard, TooltipHeader, TooltipStat, TooltipStats } from "~/components/ui/tooltip";
import type { LaneSoulPoint } from "~/lib/team-builder/analysis";
import { compactNumber, deltaBarColor, deltaClass, formatCount } from "~/lib/team-builder/format";

/** Floor on the axis, so a 40-soul wobble is not drawn with the same drama as a 900-soul rout. */
const SOUL_FLOOR = 800;

const minuteLabel = (timeS: number) => `${Math.round(timeS / 60)}′`;

const signedSouls = (diff: number) => `${diff >= 0 ? "+" : ""}${formatCount(Math.round(diff))}`;

const axisSouls = (value: number) => (value === 0 ? "0" : `${value > 0 ? "+" : "−"}${compactNumber(Math.abs(value))}`);

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
    <ChartSurface
      label={`Mean soul lead: ${points.map((p) => `${minuteLabel(p.timeS)} ${signedSouls(p.diff)}`).join(", ")}`}
      size="fill"
      variant="bare"
      className="min-h-18"
    >
      <AreaChart data={band} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset={fillOffset} stopColor={CHART_COLOR.positive} stopOpacity={0.22} />
            <stop offset={fillOffset} stopColor={CHART_COLOR.negative} stopOpacity={0.22} />
          </linearGradient>
          <linearGradient id={strokeId} x1="0" y1="0" x2="0" y2="1">
            <stop offset={strokeOffset} stopColor={CHART_COLOR.positive} />
            <stop offset={strokeOffset} stopColor={CHART_COLOR.negative} />
          </linearGradient>
        </defs>

        <XAxis
          {...CHART_AXIS_SM}
          dataKey="timeS"
          type="number"
          domain={[points[0].timeS, points[points.length - 1].timeS]}
          ticks={points.map((p) => p.timeS)}
          tickFormatter={minuteLabel}
          height={16}
          interval="preserveStartEnd"
          minTickGap={2}
        />
        <YAxis
          {...CHART_AXIS_SM}
          orientation="right"
          domain={[-bound, bound]}
          ticks={[-bound, 0, bound]}
          tickFormatter={axisSouls}
          width={32}
        />
        <ReferenceLine y={0} {...CHART_BASELINE} />

        {/* Drawn first so the mean and its dots sit on top of their own interval. */}
        <Area
          type="monotone"
          dataKey="range"
          fill={CHART_COLOR.fallback}
          fillOpacity={0.18}
          stroke={CHART_COLOR.fallback}
          strokeOpacity={0.35}
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
          cursor={CHART_CURSOR_LINE}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const point = payload[0].payload as LaneSoulPoint;
            const ahead = point.diff >= 0;
            return (
              <TooltipCard>
                <TooltipHeader title={`${Math.round(point.timeS / 60)} minutes in`} />
                <TooltipStats>
                  <TooltipStat
                    label={ahead ? "Your duo ahead" : "Your duo behind"}
                    value={signedSouls(point.diff)}
                    className={deltaClass(point.diff)}
                  />
                  <TooltipStat label="95% confidence" value={`${signedSouls(point.lo)} … ${signedSouls(point.hi)}`} />
                </TooltipStats>
                {point.lo < 0 && point.hi > 0 && (
                  <div className="text-3xs text-muted-foreground">Too close to call at this sample size</div>
                )}
              </TooltipCard>
            );
          }}
        />
      </AreaChart>
    </ChartSurface>
  );
}
