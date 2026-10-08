import type { KillDeathStats } from "deadlock_api_client";

export const GRID_RES = 256;

/** What the map shows: kill or death density, K/D, or a hero's share of the kills against all heroes. */
export type HeatmapViewMode = "kills" | "deaths" | "kd" | "share";

type HeatGrids = ReturnType<typeof buildHeatGrids>;

/**
 * How a grid reads. `density`: 0 is nothing and 1 the top of the scale. `ratio`: a log scale with 1x in the middle,
 * where 0 marks a cell too thin to draw.
 */
export type HeatScale = "density" | "ratio";

/** A normalized grid in 0..1, the raw value its top stands for, and how it reads. */
export interface NormalizedHeatGrid {
  grid: Float32Array;
  maxValue: number;
  scale: HeatScale;
}

/** Density gamma: lifts the faint tail of a skewed count so sparse spots stay visible. */
const DENSITY_GAMMA = 0.45;
/** The share view's scale ends: half and twice the hero's overall share. */
const SHARE_RANGE = 2;
/** A cell where the hero would expect fewer kills than this (at their overall share) is mostly luck, so it stays empty. */
const SHARE_MIN_EXPECTED = 5;

export const GRADIENT_STOPS: { stop: number; r: number; g: number; b: number }[] = [
  { stop: 0, r: 0, g: 0, b: 20 },
  { stop: 0.15, r: 20, g: 0, b: 200 },
  { stop: 0.3, r: 0, g: 100, b: 255 },
  { stop: 0.45, r: 0, g: 230, b: 230 },
  { stop: 0.6, r: 50, g: 255, b: 50 },
  { stop: 0.75, r: 230, g: 255, b: 0 },
  { stop: 0.88, r: 255, g: 130, b: 0 },
  { stop: 1, r: 255, g: 0, b: 0 },
];

function buildRawGrid(data: KillDeathStats[], viewMode: "kills" | "deaths", radius: number): Float32Array {
  const grid = new Float32Array(GRID_RES * GRID_RES);
  const diameter = 2 * radius;
  const splatRadius = 3;

  for (const point of data) {
    const value = viewMode === "kills" ? point.kills : point.deaths;
    if (value === 0) continue;

    const gx = ((point.position_x + radius) / diameter) * (GRID_RES - 1);
    const gy = ((radius - point.position_y) / diameter) * (GRID_RES - 1);

    const x0 = Math.max(0, Math.floor(gx) - splatRadius);
    const x1 = Math.min(GRID_RES - 1, Math.ceil(gx) + splatRadius);
    const y0 = Math.max(0, Math.floor(gy) - splatRadius);
    const y1 = Math.min(GRID_RES - 1, Math.ceil(gy) + splatRadius);

    for (let iy = y0; iy <= y1; iy++) {
      for (let ix = x0; ix <= x1; ix++) {
        const dx = ix - gx;
        const dy = iy - gy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= splatRadius) {
          const weight = 1 - dist / splatRadius;
          grid[iy * GRID_RES + ix] += value * weight;
        }
      }
    }
  }

  return grid;
}

function clampAndNormalize(grid: Float32Array, percentile = 0.99): NormalizedHeatGrid {
  const nonZero = grid.filter((value) => value > 0).sort();
  const gridMax = nonZero[Math.floor(nonZero.length * percentile)] ?? nonZero.at(-1) ?? 0;
  if (gridMax > 0) {
    for (let i = 0; i < grid.length; i++) {
      grid[i] = Math.min(grid[i], gridMax) / gridMax;
    }
  }
  return { grid, maxValue: gridMax, scale: "density" };
}

/**
 * A hero's kills per cell against what they would have there at their share of all kills: 1 is their usual share, 2
 * twice it. Drawn on a log scale clipped to 0.5x-2x with 1x in the middle, so "more" and "less" weigh the same. Cells
 * are filtered on the expected kills, never on the hero's own: hiding the cells the hero scored little in would only
 * hide the "less" side.
 */
function normalizeShare(hero: Float32Array, all: Float32Array, minEvents: number): NormalizedHeatGrid {
  const grid = new Float32Array(GRID_RES * GRID_RES);
  let heroTotal = 0;
  let allTotal = 0;
  for (let i = 0; i < grid.length; i++) {
    heroTotal += hero[i];
    allTotal += all[i];
  }
  const result = { grid, maxValue: SHARE_RANGE, scale: "ratio" } as const;
  if (heroTotal <= 0 || allTotal <= 0) return result;

  const share = heroTotal / allTotal;
  const minExpected = Math.max(SHARE_MIN_EXPECTED, minEvents);
  const span = Math.log2(SHARE_RANGE);
  for (let i = 0; i < grid.length; i++) {
    const expected = all[i] * share;
    if (expected < minExpected) continue;
    const ratio = Math.min(SHARE_RANGE, Math.max(1 / SHARE_RANGE, hero[i] / expected));
    // Never exactly 0, which marks a cell too thin to draw.
    grid[i] = Math.max(0.001, 0.5 + (0.5 * Math.log2(ratio)) / span);
  }
  return result;
}

/**
 * Normalize a copy so cached raw counts remain usable by tooltips and other views. A cell with fewer than `minEvents`
 * events (kills and deaths together for K/D, all heroes' kills for the share) stays empty, so a spot with two kills and
 * a death does not top the K/D map. The share view compares against `baseline`, the same filters for all heroes, on a
 * fixed scale that `sensitivity` does not stretch.
 */
export function normalizeHeatGrids(
  { killsRaw, deathsRaw }: HeatGrids,
  viewMode: HeatmapViewMode,
  sensitivity = 0.99,
  minEvents = 0,
  baseline?: HeatGrids,
): NormalizedHeatGrid {
  if (viewMode === "share") {
    if (!baseline) return { grid: new Float32Array(GRID_RES * GRID_RES), maxValue: SHARE_RANGE, scale: "ratio" };
    return normalizeShare(killsRaw, baseline.killsRaw, minEvents);
  }

  if (viewMode === "kd") {
    const grid = new Float32Array(GRID_RES * GRID_RES);

    const minActivity = Math.max(1, minEvents);
    for (let i = 0; i < grid.length; i++) {
      if (killsRaw[i] + deathsRaw[i] >= minActivity) {
        grid[i] = deathsRaw[i] > 0.5 ? killsRaw[i] / deathsRaw[i] : killsRaw[i];
      }
    }

    return clampAndNormalize(grid, sensitivity);
  }

  const grid = (viewMode === "kills" ? killsRaw : deathsRaw).slice();
  if (minEvents > 0) {
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] < minEvents) grid[i] = 0;
    }
  }
  return clampAndNormalize(grid, sensitivity);
}

export function buildHeatGrids(
  data: KillDeathStats[],
  radius: number,
): {
  killsRaw: Float32Array;
  deathsRaw: Float32Array;
} {
  return {
    killsRaw: buildRawGrid(data, "kills", radius),
    deathsRaw: buildRawGrid(data, "deaths", radius),
  };
}

export function sampleBilinear(grid: Float32Array, gridW: number, gridH: number, gx: number, gy: number): number {
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const x1 = Math.min(x0 + 1, gridW - 1);
  const y1 = Math.min(y0 + 1, gridH - 1);
  const fx = gx - x0;
  const fy = gy - y0;

  const cx0 = Math.max(0, Math.min(x0, gridW - 1));
  const cy0 = Math.max(0, Math.min(y0, gridH - 1));

  const v00 = grid[cy0 * gridW + cx0];
  const v10 = grid[cy0 * gridW + x1];
  const v01 = grid[y1 * gridW + cx0];
  const v11 = grid[y1 * gridW + x1];

  return v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy;
}

function buildColorLUT(): Uint8Array {
  const lut = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let r = 0;
    let g = 0;
    let b = 0;
    for (let s = 0; s < GRADIENT_STOPS.length - 1; s++) {
      const c0 = GRADIENT_STOPS[s];
      const c1 = GRADIENT_STOPS[s + 1];
      if (t >= c0.stop && t <= c1.stop) {
        const ratio = (t - c0.stop) / (c1.stop - c0.stop);
        r = Math.round(c0.r + (c1.r - c0.r) * ratio);
        g = Math.round(c0.g + (c1.g - c0.g) * ratio);
        b = Math.round(c0.b + (c1.b - c0.b) * ratio);
        break;
      }
    }
    if (t > GRADIENT_STOPS[GRADIENT_STOPS.length - 1].stop) {
      const last = GRADIENT_STOPS[GRADIENT_STOPS.length - 1];
      r = last.r;
      g = last.g;
      b = last.b;
    }
    lut[i * 4] = r;
    lut[i * 4 + 1] = g;
    lut[i * 4 + 2] = b;
    lut[i * 4 + 3] = i === 0 ? 0 : Math.round(50 + t * 170);
  }
  return lut;
}

const COLOR_LUT = buildColorLUT();

/**
 * The ratio ramp: the legend's colors (the density ramp without its near-black floor) evenly spaced, so 1x lands on
 * the green middle stop, at one opacity, so "less" reads as clearly as "more".
 */
function buildRatioLUT(): Uint8Array {
  const stops = GRADIENT_STOPS.slice(1);
  const lut = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const position = (i / 255) * (stops.length - 1);
    const s = Math.min(stops.length - 2, Math.floor(position));
    const ratio = position - s;
    lut[i * 4] = Math.round(stops[s].r + (stops[s + 1].r - stops[s].r) * ratio);
    lut[i * 4 + 1] = Math.round(stops[s].g + (stops[s + 1].g - stops[s].g) * ratio);
    lut[i * 4 + 2] = Math.round(stops[s].b + (stops[s + 1].b - stops[s].b) * ratio);
    lut[i * 4 + 3] = 166;
  }
  return lut;
}

const RATIO_LUT = buildRatioLUT();

/** The colors (RGBA per 0..255 step) a grid's scale is drawn in. */
export function heatLUT(scale: HeatScale): Uint8Array {
  return scale === "ratio" ? RATIO_LUT : COLOR_LUT;
}

/**
 * Where on its ramp (0..1) a grid point falls, or -1 where nothing is drawn. A ratio grid blends only the cells it
 * draws, so the edge of the drawn area does not fade through the "less" end of the ramp into the empty cells.
 */
export function sampleHeat({ grid, scale }: NormalizedHeatGrid, gx: number, gy: number, threshold = 0.001): number {
  if (scale === "density") {
    const raw = sampleBilinear(grid, GRID_RES, GRID_RES, gx, gy);
    return raw < threshold ? -1 : raw ** DENSITY_GAMMA;
  }
  const max = GRID_RES - 1;
  if (grid[Math.min(max, Math.round(gy)) * GRID_RES + Math.min(max, Math.round(gx))] <= 0) return -1;
  const x0 = Math.min(max, Math.floor(gx));
  const y0 = Math.min(max, Math.floor(gy));
  const x1 = Math.min(x0 + 1, max);
  const y1 = Math.min(y0 + 1, max);
  const fx = gx - x0;
  const fy = gy - y0;
  let sum = 0;
  let weights = 0;
  for (const [index, weight] of [
    [y0 * GRID_RES + x0, (1 - fx) * (1 - fy)],
    [y0 * GRID_RES + x1, fx * (1 - fy)],
    [y1 * GRID_RES + x0, (1 - fx) * fy],
    [y1 * GRID_RES + x1, fx * fy],
  ] as const) {
    if (grid[index] > 0) {
      sum += grid[index] * weight;
      weights += weight;
    }
  }
  return weights > 0 ? sum / weights : -1;
}

const ROWS = ["top", "middle", "bottom"] as const;
const COLUMNS = ["left", "center", "right"] as const;

/** Which ninth of the map, as it is drawn, a grid cell falls in: "top left", "center", "bottom center". */
function regionOf(index: number): string {
  const row = ROWS[Math.min(2, Math.floor(((Math.floor(index / GRID_RES) + 0.5) / GRID_RES) * 3))];
  const column = COLUMNS[Math.min(2, Math.floor((((index % GRID_RES) + 0.5) / GRID_RES) * 3))];
  if (row === "middle") return column === "center" ? "center" : `middle ${column}`;
  return `${row} ${column}`;
}

/**
 * The heatmap in one sentence, for the readers who cannot see the canvas: the kills and deaths it plots and where on
 * the map the view's hottest spot is (kills and deaths together for the K/D view).
 */
export function summarizeHeatmap(
  data: KillDeathStats[],
  { killsRaw, deathsRaw }: HeatGrids,
  viewMode: HeatmapViewMode,
  /** The share view's normalized grid, whose top is where the hero takes the largest share of the kills. */
  shareGrid?: Float32Array,
): string {
  let kills = 0;
  let deaths = 0;
  for (const point of data) {
    kills += point.kills;
    deaths += point.deaths;
  }
  let hottest = -1;
  let hottestValue = 0;
  for (let i = 0; i < killsRaw.length; i++) {
    const value =
      viewMode === "share"
        ? (shareGrid?.[i] ?? 0)
        : viewMode === "kills"
          ? killsRaw[i]
          : viewMode === "deaths"
            ? deathsRaw[i]
            : killsRaw[i] + deathsRaw[i];
    if (value > hottestValue) {
      hottestValue = value;
      hottest = i;
    }
  }
  const plotted = `${kills.toLocaleString("en-US")} kills and ${deaths.toLocaleString("en-US")} deaths plotted`;
  if (hottest < 0) return `${plotted}.`;
  if (viewMode === "share")
    return `${plotted}; the hero's share of the kills is largest near the ${regionOf(hottest)} of the map.`;
  const what = viewMode === "kills" ? "kills" : viewMode === "deaths" ? "deaths" : "fighting";
  return `${plotted}; the most ${what} ${what === "fighting" ? "happens" : "happen"} near the ${regionOf(hottest)} of the map.`;
}

const VIEW_NAMES = { kills: "Kill", deaths: "Death", kd: "K/D", share: "Kill share" } as const;

/** The accessible name of a heatmap view: "Kill heatmap, The Hidden King, Haze". */
export function heatmapName(viewMode: HeatmapViewMode, scope?: string): string {
  return `${VIEW_NAMES[viewMode]} heatmap of the map${scope ? `, ${scope}` : ""}`;
}
