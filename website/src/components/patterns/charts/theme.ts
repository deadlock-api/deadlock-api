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
/**
 * A category x-axis (match length brackets, weekdays): every category keeps its label. Recharts' default thins an
 * axis it thinks is crowded from the end, which left "25–35 min | 45+ min" on a phone.
 */
export const CHART_X_AXIS_CATEGORY = { ...CHART_X_AXIS, interval: 0 } as const;
export const CHART_X_AXIS_SM = { ...CHART_X_AXIS, tick: CHART_TICK_SM } as const;
export const CHART_Y_AXIS_SM = { ...CHART_Y_AXIS, tick: CHART_TICK_SM } as const;

/**
 * Axis titles, spread into the axis' `label` next to `value`. They sit inside the auto-sized axis, which makes room
 * for them, so the chart needs no extra margin on that side. The y title is centred on the plot at the outer edge.
 * They take the tick size (`--chart-tick`), not the SVG default of 16px.
 */
export const CHART_X_LABEL = {
  position: "insideBottom",
  offset: 0,
  fontSize: "var(--chart-tick)",
  fill: "var(--chart-axis)",
} as const;
export const CHART_Y_LABEL = {
  angle: -90,
  position: "insideLeft",
  textAnchor: "middle",
  offset: 12,
  fontSize: "var(--chart-tick)",
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

/**
 * The ticks to label on an axis `width` px long: every k-th one, the smallest k that leaves `minGap` px per label, so
 * the labels stay evenly spaced (Recharts' own thinning drops uneven ones: "00:00 | 06:00 | 12:00 | 21:00"). Pass the
 * result as `ticks` with `interval={0}`; the plot's width comes from `ChartSurface`'s `onResize`. Before the plot is
 * measured (width 0) every tick is kept.
 */
export function thinTicks<T>(ticks: readonly T[], width: number, minGap = 44): T[] {
  if (width <= 0 || ticks.length <= 2) return [...ticks];
  const step = Math.max(1, Math.ceil((minGap * ticks.length) / width));
  return ticks.filter((_, index) => index % step === 0);
}

/**
 * Ticks on a value axis whose inner marks (a median) can fall next to an edge (the minimum): keeps the first and last,
 * and drops an inner tick closer than `minShare` of the span to a kept one, so two labels never touch. Without a span
 * (one value) only the first is kept.
 */
export function spacedTicks(ticks: readonly number[], minShare = 0.18): number[] {
  const sorted = [...new Set(ticks)].sort((a, b) => a - b);
  const first = sorted[0];
  const last = sorted.at(-1);
  if (first === undefined || last === undefined || last === first) return first === undefined ? [] : [first];
  const gap = (last - first) * minShare;
  const kept = [first];
  for (const tick of sorted.slice(1, -1)) {
    if (tick - kept[kept.length - 1] >= gap && last - tick >= gap) kept.push(tick);
  }
  kept.push(last);
  return kept;
}

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

/**
 * The players of a comparison, one color a slot. Unlike `SERIES_COLORS` any two of them can share a chart (a player's
 * slot is hashed from their account id), so every pair is told apart under color blindness, not only neighbours.
 */
export const COMPARE_COLORS = [
  "var(--compare-1)",
  "var(--compare-2)",
  "var(--compare-3)",
  "var(--compare-4)",
  "var(--compare-5)",
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
  /** Pick rate (and normal purchases) in the stat tables, beside labels in `text-chart-4`. */
  pickRate: "var(--chart-4)",
  /** A mark in ink that is not a series: the core items of a build, a point on a curve. */
  ink: "var(--foreground)",
  /** A mark that warns: a flexible pick, a value to double-check. */
  caution: "var(--warning)",
  /** A reference that is not data (a lobby average, a median), in the axis color; legend keys for one use it too. */
  reference: "var(--chart-axis)",
  /** A rule on the plot's own grid, such as an axis line drawn against it. */
  grid: "var(--chart-grid)",
  /** The surface under the plot: the rim that separates a dot from the line it sits on. */
  surface: "var(--card)",
} as const;

/**
 * A data-driven mark color (a rank's or a hero's color from the assets API) lifted to the lightness floor
 * `--chart-mark-floor-l`, so a dark entity color still stands 3:1 off the plot surface (WCAG 1.4.11). Hue and chroma
 * stay; a color already lighter is unchanged. A missing color is `CHART_COLOR.fallback`.
 */
export function chartMarkColor(color: string | null | undefined): string {
  if (!color) return CHART_COLOR.fallback;
  return `oklch(from ${color} max(l, var(--chart-mark-floor-l)) c h)`;
}

/** The dot on a line under the tooltip cursor: rimmed in the surface color so it reads over the line. */
export const CHART_ACTIVE_DOT = { r: 4, stroke: CHART_COLOR.surface, strokeWidth: 2 } as const;

export const CHART_MARGIN = { top: 8, right: 8, bottom: 8, left: 0 } as const;
/**
 * A scatter plot's margin: room on the sides without an axis for the largest point mark (a selected point of radius 7
 * and its stroke), so a point on the domain's edge is drawn whole. Do not clip the plot (`allowDataOverflow`) either.
 */
export const CHART_MARGIN_POINTS = { top: 12, right: 12, bottom: 8, left: 0 } as const;
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

/** The median of a population, drawn on its distribution: finer than the baseline dash. Its legend key is `dashed`. */
export const CHART_MEDIAN_LINE = { stroke: "var(--chart-axis)", strokeDasharray: "2 2", strokeWidth: 1 } as const;
/** The quartiles (P25, P75) around a median: dotted, so they read apart from it. Their legend key is `dotted`. */
export const CHART_QUARTILE_LINE = { stroke: "var(--chart-axis)", strokeDasharray: "1 3", strokeWidth: 1 } as const;
/** A population's average on its distribution, in the brand color, a longer dash. Its legend key is `dashed`. */
export const CHART_AVERAGE_LINE = { stroke: "var(--primary)", strokeDasharray: "3 3", strokeWidth: 1.5 } as const;

/**
 * The rim between the segments of a stacked bar, in the surface color: neighbouring segments whose hues are close for
 * a color-blind eye still read as separate parts. Spread it on every `Bar` with a `stackId`.
 */
export const CHART_STACK_SEGMENT = { stroke: "var(--card)", strokeWidth: 1 } as const;

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

/**
 * A shaded span of the x axis (a respawn wait, a phase): the spread band's faint fill with a thin edge in the same
 * color, so the span still shows where the fill alone is too faint to see. Spread it on a `ReferenceArea` with `fill`
 * and `stroke` set to the color; its legend key is `ChartSwatch shape="band"` in that color.
 */
export const CHART_SHADED_WINDOW = {
  fillOpacity: CHART_SPREAD_BAND.fillOpacity,
  strokeOpacity: 0.6,
  strokeWidth: 1,
} as const;

/** A population's distribution under the players drawn on it: a faint neutral area with a thin edge. */
export const CHART_AREA_NEUTRAL = {
  stroke: CHART_COLOR.neutral,
  strokeWidth: 1,
  fill: CHART_COLOR.neutral,
  fillOpacity: 0.15,
} as const;

/** One stop of a canvas color ramp: where on the scale (0 to 1) it sits and its sRGB channels. */
export interface ChartRampStop {
  stop: number;
  rgb: readonly [number, number, number];
}

/**
 * The color ramps of plots drawn pixel by pixel (a canvas heatmap, a WebGL scene), which cannot read CSS variables.
 * `sequential` (inferno) runs from near-black to pale yellow with lightness rising at every step, so more is always
 * lighter, in every kind of color blindness and in grayscale: counts and rates. `diverging` (red-blue) has a neutral
 * pale middle for "as usual" and darkens towards blue for less and red for more, two hues every color-blind eye
 * tells apart: ratios against a baseline. Legends take the same stops through `chartRampCss`.
 */
// ds-allow color-literal: canvas/WebGL palettes, drawn pixel by pixel where CSS variables cannot reach
export const CHART_RAMP = {
  sequential: [
    { stop: 0, rgb: [0, 0, 4] },
    { stop: 0.125, rgb: [31, 12, 72] },
    { stop: 0.25, rgb: [85, 15, 109] },
    { stop: 0.375, rgb: [136, 34, 106] },
    { stop: 0.5, rgb: [186, 54, 85] },
    { stop: 0.625, rgb: [227, 89, 51] },
    { stop: 0.75, rgb: [249, 140, 10] },
    { stop: 0.875, rgb: [249, 201, 50] },
    { stop: 1, rgb: [252, 255, 164] },
  ],
  diverging: [
    { stop: 0, rgb: [33, 102, 172] },
    { stop: 0.25, rgb: [103, 169, 207] },
    { stop: 0.5, rgb: [247, 247, 247] },
    { stop: 0.75, rgb: [244, 165, 130] },
    { stop: 1, rgb: [178, 24, 43] },
  ],
} as const satisfies Record<string, readonly ChartRampStop[]>;

export type ChartRamp = keyof typeof CHART_RAMP;

/** The color at `t` (0 to 1) of a ramp, interpolated between its stops in sRGB. */
export function chartRampColor(ramp: ChartRamp, t: number): [number, number, number] {
  const stops: readonly ChartRampStop[] = CHART_RAMP[ramp];
  const at = Math.min(1, Math.max(0, t));
  for (let s = 0; s < stops.length - 1; s++) {
    const low = stops[s];
    const high = stops[s + 1];
    if (at <= high.stop) {
      const ratio = (at - low.stop) / (high.stop - low.stop);
      return [0, 1, 2].map((c) => Math.round(low.rgb[c] + (high.rgb[c] - low.rgb[c]) * ratio)) as [
        number,
        number,
        number,
      ];
    }
  }
  const last = stops[stops.length - 1].rgb;
  return [last[0], last[1], last[2]];
}

/** A ramp's stops as CSS colors, low to high, for the `ChartGradientLegend` of a plot drawn in it. */
export function chartRampCss(ramp: ChartRamp): string[] {
  return CHART_RAMP[ramp].map(({ rgb: [r, g, b] }) => `rgb(${r} ${g} ${b})`);
}
