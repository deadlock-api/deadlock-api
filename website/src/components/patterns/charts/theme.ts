/**
 * Chart chrome, as Recharts props. Spread these instead of writing stroke, dash and font values per chart:
 * `<CartesianGrid {...CHART_GRID} />`, `<XAxis {...CHART_X_AXIS} />`, `<YAxis {...CHART_Y_AXIS} />`.
 */

export const CHART_GRID = { strokeDasharray: "3 3", stroke: "var(--chart-grid)", vertical: false } as const;

/** Tick text, in rem through `--chart-tick`, so it grows with the reader's font size. Also for axis labels. */
export const CHART_TICK = { fontSize: "var(--chart-tick)", fill: "var(--chart-axis)" } as const;
/** For charts under 100px tall: sparkline panels, distribution strips. */
export const CHART_TICK_SM = { fontSize: "var(--chart-tick-sm)", fill: "var(--chart-axis)" } as const;

const AXIS = { stroke: "var(--chart-axis)", tick: CHART_TICK, tickLine: false, axisLine: false } as const;

/**
 * Axes size themselves to their tick labels (and axis label), measured before paint, so a long label or a larger
 * font never clips and a short one wastes no room. Pass a number only where the axis draws no tick text of its own
 * (`tick={false}`, a custom tick element such as `RankTierTick`) or other geometry is laid out against its size.
 */
export const CHART_X_AXIS = { ...AXIS, height: "auto" } as const;
export const CHART_Y_AXIS = { ...AXIS, width: "auto" } as const;
export const CHART_X_AXIS_SM = { ...CHART_X_AXIS, tick: CHART_TICK_SM } as const;
export const CHART_Y_AXIS_SM = { ...CHART_Y_AXIS, tick: CHART_TICK_SM } as const;

/**
 * Axis titles, spread into the axis' `label` next to `value`. They sit inside the auto-sized axis, which makes room
 * for them, so the chart needs no extra margin on that side. The y title is centred on the plot at the outer edge.
 */
export const CHART_X_LABEL = { position: "insideBottom", offset: 0, fill: "var(--chart-axis)" } as const;
export const CHART_Y_LABEL = {
  angle: -90,
  position: "insideLeft",
  textAnchor: "middle",
  offset: 12,
  fill: "var(--chart-axis)",
} as const;

/** The "even" or "average" line a series is read against. */
export const CHART_BASELINE = { stroke: "var(--chart-axis)", strokeDasharray: "4 4" } as const;

/** An event on the x-axis, such as a patch: a fine dotted rule under the series, and its label in tick text. */
export const CHART_MARKER_LINE = { stroke: "var(--chart-axis)", strokeDasharray: "2 3", strokeWidth: 1 } as const;
/** The label beside a marker line; the halo keeps a label in a lower row readable over the series. */
export const CHART_MARKER_LABEL = {
  ...CHART_TICK,
  textAnchor: "start",
  stroke: "var(--card)",
  strokeWidth: 3,
  strokeLinejoin: "round",
  paintOrder: "stroke",
} as const;

/** Tooltip cursors: a vertical rule for line and area charts, a column highlight for bars. */
export const CHART_CURSOR_LINE = { stroke: "var(--chart-axis)", strokeWidth: 1 } as const;
export const CHART_CURSOR_BAND = { fill: "var(--subtle-hover)" } as const;

/** Categorical series colors. Assign by index in this order and never cycle; fold a 9th series into "Other". */
export const SERIES_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
] as const;

/** Series whose meaning is fixed across the site, so their color is too. */
export const CHART_COLOR = {
  primary: "var(--primary)",
  positive: "var(--positive)",
  negative: "var(--negative)",
  neutral: "var(--muted-foreground)",
  winRate: "var(--chart-win-rate)",
  share: "var(--chart-share)",
  /** The second series a chart compares its main one with, such as corrupted item purchases. */
  comparison: "var(--chart-5)",
  /** A hero or rank whose own color is missing from the assets API. */
  fallback: "var(--foreground)",
} as const;

export const CHART_MARGIN = { top: 8, right: 8, bottom: 8, left: 0 } as const;
/** `CHART_MARGIN` with a lane at the top for the labels of `ChartMarkers`. */
export const CHART_MARGIN_MARKED = { ...CHART_MARGIN, top: 24 } as const;

/**
 * Small multiples (distribution strips): a little air above the curve and room at the sides for a line drawn on
 * the plot's edge and for edge tick labels that align inward.
 */
export const CHART_MARGIN_SM = { top: 4, right: 12, bottom: 0, left: 12 } as const;

/**
 * An x-axis whose ticks are a custom element (such as labels aligned inward at the plot's edges): the element draws
 * text the axis cannot measure, so the axis takes a fixed height, and a short mark at each labelled point. Spread
 * it in place of `CHART_X_AXIS` and offset the tick text by `CHART_CUSTOM_TICK_DY`.
 */
export const CHART_X_AXIS_CUSTOM_TICK = {
  ...CHART_X_AXIS,
  height: 28,
  tickLine: { stroke: "var(--chart-axis)" },
  tickSize: 4,
  axisLine: { stroke: "var(--chart-grid)" },
} as const;
/** How far below the tick mark a custom tick's text sits, in px from the axis line. */
export const CHART_CUSTOM_TICK_DY = 14;

/** The median of a population, drawn on its distribution: finer than the baseline dash. */
export const CHART_MEDIAN_LINE = { stroke: "var(--chart-axis)", strokeDasharray: "2 2", strokeWidth: 1 } as const;

/**
 * The ±1 standard deviation band around an average line: a faint fill, no edge. Draw it as a range `Area` (a dataKey
 * returning `[low, high]`) under the line, in the line's color.
 */
export const CHART_SPREAD_BAND = {
  stroke: "none",
  fillOpacity: 0.12,
  isAnimationActive: false,
  activeDot: false,
} as const;

/** A population's distribution under the players drawn on it: a faint neutral area with a thin edge. */
export const CHART_AREA_NEUTRAL = {
  stroke: CHART_COLOR.neutral,
  strokeWidth: 1,
  fill: CHART_COLOR.neutral,
  fillOpacity: 0.15,
} as const;
