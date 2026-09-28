import {
  Children,
  cloneElement,
  type ComponentProps,
  createContext,
  isValidElement,
  type ReactElement,
  useContext,
} from "react";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart as RechartsRadarChart, Tooltip } from "recharts";

import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import { CHART_BASELINE, CHART_CURSOR_LINE, CHART_TICK } from "~/components/patterns/charts/theme";

const PERCENT_DOMAIN: [number, number] = [0, 100];
// Room at the sides for the axis names, which sit outside the rim.
const MARGIN = { top: 8, right: 40, bottom: 8, left: 40 } as const;

/** The series the reader singled out, or null: the rest step back. */
const HighlightContext = createContext<string | null>(null);

/** Fill and stroke of a series: a faint fill so overlapping shapes stay readable, the outline carrying identity. */
const SERIES_STYLE = {
  rest: { fillOpacity: 0.08, strokeOpacity: 1, strokeWidth: 2 },
  highlighted: { fillOpacity: 0.28, strokeOpacity: 1, strokeWidth: 2.5 },
  dimmed: { fillOpacity: 0, strokeOpacity: 0.25, strokeWidth: 1.5 },
} as const;

interface RadarSeriesProps {
  /** The field of each row that holds this series' value; also its id for `highlighted`. */
  dataKey: string;
  /** The series name, for the tooltip payload. */
  name?: string;
  /** A CSS color: `SERIES_COLORS[i]`, or an entity's own series color. */
  color: string;
}

/** One shape of a `RadarChart`: the series' value on every axis, joined. */
export function RadarSeries({ dataKey, name, color }: RadarSeriesProps) {
  const highlighted = useContext(HighlightContext);
  const state = highlighted == null ? "rest" : highlighted === dataKey ? "highlighted" : "dimmed";
  const style = SERIES_STYLE[state];
  return (
    <Radar
      dataKey={dataKey}
      name={name ?? dataKey}
      stroke={color}
      fill={color}
      strokeLinejoin="round"
      {...style}
      // The points of the singled-out shape, ringed in the surface color so they read over the other outlines.
      dot={state === "highlighted" ? { r: 3.5, fill: color, stroke: "var(--card)", strokeWidth: 1.5 } : false}
      isAnimationActive={false}
    />
  );
}

type KeysOfType<T, V> = { [K in keyof T]-?: T[K] extends V ? K : never }[keyof T] & string;

interface RadarChartProps<T> extends Omit<ComponentProps<typeof ChartSurface>, "children"> {
  /** One row per axis. */
  data: readonly T[];
  /** The field that names each axis. */
  axisKey: KeysOfType<T, string>;
  /** The value range from the centre to the rim. */
  domain?: [number, number];
  /** A value drawn as a dashed ring on every axis: the median, the average, "even". */
  baseline?: number;
  /** The `dataKey` of the series to bring forward; the others step back. */
  highlighted?: string | null;
  /** The hover card: an element that receives the hovered axis' row as its `entry` prop. */
  tooltip?: ReactElement<{ entry?: T }>;
  /** `RadarSeries` children, one per series, in their color order. */
  children: ReactElement<RadarSeriesProps> | ReactElement<RadarSeriesProps>[];
}

/**
 * Several measures on one common scale (percentiles, scores), one axis each around a circle, a shape per series.
 * Compare two to five series; singling one out (`highlighted`, driven by a `ChartLegendToggle` per series) keeps a
 * crowded chart readable. Only for measures that share a scale: each axis runs over the same `domain`.
 */
export function RadarChart<T>({
  data,
  axisKey,
  domain = PERCENT_DOMAIN,
  baseline,
  highlighted = null,
  tooltip,
  announce = "plot",
  children,
  ...surfaceProps
}: RadarChartProps<T>) {
  // The singled-out shape is drawn last, over the others.
  const series = Children.toArray(children)
    .filter(isValidElement<RadarSeriesProps>)
    .sort((a, b) => Number(a.props.dataKey === highlighted) - Number(b.props.dataKey === highlighted));
  return (
    <ChartSurface announce={announce} {...surfaceProps}>
      <RechartsRadarChart data={data} outerRadius="72%" margin={MARGIN} accessibilityLayer={announce === "plot"}>
        <PolarGrid gridType="polygon" stroke="var(--chart-grid)" />
        <PolarAngleAxis dataKey={axisKey} tick={CHART_TICK} tickLine={false} axisLine={false} />
        <PolarRadiusAxis domain={domain} tickCount={5} tick={false} axisLine={false} />
        {baseline != null && (
          <Radar
            dataKey={() => baseline}
            name="baseline"
            {...CHART_BASELINE}
            fill="none"
            isAnimationActive={false}
            legendType="none"
          />
        )}
        <HighlightContext.Provider value={highlighted}>{series}</HighlightContext.Provider>
        {tooltip && (
          <Tooltip
            cursor={CHART_CURSOR_LINE}
            content={({ active, payload }) =>
              active && payload?.length ? cloneElement(tooltip, { entry: payload[0].payload as T }) : null
            }
          />
        )}
      </RechartsRadarChart>
    </ChartSurface>
  );
}
