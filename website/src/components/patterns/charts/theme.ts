/**
 * Chart chrome, as Recharts props. Spread these instead of writing stroke, dash and font values per chart:
 * `<CartesianGrid {...CHART_GRID} />`, `<YAxis {...CHART_AXIS} />`.
 */

export const CHART_GRID = { strokeDasharray: "3 3", stroke: "var(--chart-grid)", vertical: false } as const;

export const CHART_TICK = { fontSize: 11, fill: "var(--chart-axis)" } as const;
/** For charts under 100px tall: sparkline panels, distribution strips. */
export const CHART_TICK_SM = { fontSize: 9, fill: "var(--chart-axis)" } as const;

export const CHART_AXIS = { stroke: "var(--chart-axis)", tick: CHART_TICK, tickLine: false, axisLine: false } as const;
export const CHART_AXIS_SM = { ...CHART_AXIS, tick: CHART_TICK_SM } as const;

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
