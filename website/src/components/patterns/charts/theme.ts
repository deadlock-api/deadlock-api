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
  /** A hero or rank whose own color is missing from the assets API. */
  fallback: "var(--foreground)",
} as const;

export const CHART_MARGIN = { top: 8, right: 8, bottom: 8, left: 0 } as const;
