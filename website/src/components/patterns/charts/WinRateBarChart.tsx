import { cloneElement, type ComponentProps, type ReactElement } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";

import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import {
  CHART_AXIS,
  CHART_BASELINE,
  CHART_CURSOR_BAND,
  CHART_GRID,
  CHART_MARGIN,
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
  ...surfaceProps
}: WinRateBarChartProps<T>) {
  const rate = (entry: T) => entry[valueKey] as number;
  const domain = winRateDomain([baseline, ...data.map(rate)]);
  return (
    <ChartSurface label={label} {...surfaceProps}>
      <BarChart data={data as T[]} margin={CHART_MARGIN}>
        <CartesianGrid {...CHART_GRID} />
        <XAxis
          {...CHART_AXIS}
          dataKey={(entry: T) => entry[xKey]}
          interval={0}
          height={xAxisHeight}
          {...(xTick && { tick: xTick })}
        />
        <YAxis
          {...CHART_AXIS}
          domain={domain}
          ticks={percentTicks(domain)}
          tickFormatter={(value: number) => `${Math.round(value * 100)}%`}
          width={44}
        />
        <ReferenceLine y={baseline} {...CHART_BASELINE} />
        <Tooltip
          cursor={CHART_CURSOR_BAND}
          content={({ active, payload }) =>
            active && payload?.length ? cloneElement(tooltip, { entry: payload[0].payload as T }) : null
          }
        />
        <Bar dataKey={(entry: T) => [baseline, rate(entry)]} radius={4}>
          {data.map((entry) => (
            <Cell
              key={String(entry[xKey])}
              fill={colorKey ? (entry[colorKey] as string) : TONE_COLOR[toneOf(rate(entry), baseline)]}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartSurface>
  );
}
