import { cloneElement, type ComponentProps, type ReactElement } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";

import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import {
  CHART_BASELINE,
  CHART_COLOR,
  CHART_CURSOR_BAND,
  CHART_GRID,
  CHART_MARGIN,
  CHART_TICK,
  CHART_X_AXIS,
  CHART_Y_AXIS,
} from "~/components/patterns/charts/theme";
import { percentTicks, winRateDomain } from "~/lib/chart-axis";
import { TONE_COLOR, toneOf } from "~/lib/tone";

type KeysOfType<T, V> = { [K in keyof T]-?: T[K] extends V ? K : never }[keyof T] & string;

interface WinRateBarChartProps<T> extends Omit<ComponentProps<typeof ChartSurface>, "children" | "label"> {
  /** Describes the plot to assistive technology: "Win rate by rank". */
  label: string;
  data: readonly T[];
  /** The field that names each bar on the x-axis. */
  xKey: KeysOfType<T, string | number>;
  /** The field that holds the rate, from 0 to 1. */
  valueKey: KeysOfType<T, number>;
  /**
   * The field that holds a CSS color per bar, for bars that are entities (a rank, a hero). Without it a bar is
   * positive above the baseline and negative below it.
   */
  colorKey?: KeysOfType<T, string>;
  /** The hover card: an element that receives the hovered datum as its `entry` prop. */
  tooltip: ReactElement<{ entry?: T }>;
  /** A custom x-axis tick, such as a rank badge, and the axis height it needs. */
  xTick?: ReactElement;
  xAxisHeight?: number;
  /** The rate that means "even". */
  baseline?: number;
  /** `visible` prints each bar's rate at its far end, for a few bars that should read without a hover. */
  values?: "hidden" | "visible";
}

/** A bar's rate at its far end: over a bar that rises from the baseline, under one that falls. */
function BarValue({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  value,
  baseline,
}: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  value?: number;
  baseline: number;
}) {
  if (value === undefined) return null;
  const top = Math.min(y, y + height);
  const bottom = Math.max(y, y + height);
  const above = value >= baseline;
  return (
    <text
      x={x + width / 2}
      y={above ? top - 4 : bottom + 4}
      dominantBaseline={above ? "auto" : "hanging"}
      textAnchor="middle"
      fontSize={CHART_TICK.fontSize}
      fill={CHART_COLOR.ink}
      className="tabular-nums"
    >
      {`${(value * 100).toFixed(1)}%`}
    </text>
  );
}

/**
 * Win rate per category, with each bar drawn from the 50% line instead of from zero: up is better than even, down
 * is worse, and a two-point difference stays visible. The axis is zoomed around the data and always holds the line.
 */
export function WinRateBarChart<T>({
  label,
  data,
  xKey,
  valueKey,
  colorKey,
  tooltip,
  xTick,
  xAxisHeight,
  baseline = 0.5,
  values = "hidden",
  ...surfaceProps
}: WinRateBarChartProps<T>) {
  const rate = (entry: T) => entry[valueKey] as number;
  const fitted = winRateDomain([baseline, ...data.map(rate)]);
  // Printed values need a line of room past the longest bars on either side.
  const room = values === "visible" ? (fitted[1] - fitted[0]) * 0.15 : 0;
  const domain: [number, number] = [fitted[0] - room, fitted[1] + room];
  // Recharts colours each bar from its data point's `fill`.
  const bars = data.map((entry) => ({
    ...entry,
    fill: colorKey ? (entry[colorKey] as string) : TONE_COLOR[toneOf(rate(entry), baseline)],
  }));
  return (
    <ChartSurface label={label} {...surfaceProps}>
      <BarChart data={bars} margin={CHART_MARGIN}>
        <CartesianGrid {...CHART_GRID} />
        <XAxis
          {...CHART_X_AXIS}
          dataKey={(entry: T) => entry[xKey]}
          interval={0}
          height={xAxisHeight ?? CHART_X_AXIS.height}
          {...(xTick && { tick: xTick })}
        />
        <YAxis
          {...CHART_Y_AXIS}
          domain={domain}
          ticks={percentTicks(domain)}
          tickFormatter={(value: number) => `${Math.round(value * 100)}%`}
        />
        <ReferenceLine y={baseline} {...CHART_BASELINE} />
        <Tooltip
          cursor={CHART_CURSOR_BAND}
          content={({ active, payload }) =>
            active && payload?.length ? cloneElement(tooltip, { entry: payload[0].payload as T }) : null
          }
        />
        <Bar dataKey={(entry: T) => [baseline, rate(entry)]} radius={4}>
          {values === "visible" && (
            <LabelList
              dataKey={(entry: T) => rate(entry)}
              content={(props) => (
                <BarValue
                  x={Number(props.x)}
                  y={Number(props.y)}
                  width={Number(props.width)}
                  height={Number(props.height)}
                  value={typeof props.value === "number" ? props.value : undefined}
                  baseline={baseline}
                />
              )}
            />
          )}
        </Bar>
      </BarChart>
    </ChartSurface>
  );
}
