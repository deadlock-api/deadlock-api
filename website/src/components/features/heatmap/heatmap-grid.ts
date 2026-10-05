import type { KillDeathStats } from "deadlock_api_client";

export const GRID_RES = 256;

/** What the map shows: kill or death density, K/D, or a hero's share of the kills against all heroes. */
export type HeatmapViewMode = "kills" | "deaths" | "kd" | "share";

type HeatGrids = ReturnType<typeof buildHeatGrids>;

/** A normalized grid in 0..1, the raw value its top stands for, and the gamma that maps a cell to its color. */
export interface NormalizedHeatGrid {
  grid: Float32Array;
  maxValue: number;
  gamma: number;
}

/** Density gamma: lifts the faint tail of a skewed count so sparse spots stay visible. */
const DENSITY_GAMMA = 0.45;
/** Kills a cell borrows at the hero's overall share, so a spot with a single kill does not read as 100% or 0%. */
const SHARE_PRIOR = 5;

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

export function interpolateColor(t: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, t));
  for (let i = 0; i < GRADIENT_STOPS.length - 1; i++) {
    const c0 = GRADIENT_STOPS[i];
    const c1 = GRADIENT_STOPS[i + 1];
    if (clamped >= c0.stop && clamped <= c1.stop) {
      const ratio = (clamped - c0.stop) / (c1.stop - c0.stop);
      return [
        Math.round(c0.r + (c1.r - c0.r) * ratio),
        Math.round(c0.g + (c1.g - c0.g) * ratio),
        Math.round(c0.b + (c1.b - c0.b) * ratio),
      ];
    }
  }
  const last = GRADIENT_STOPS[GRADIENT_STOPS.length - 1];
  return [last.r, last.g, last.b];
}

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
  return { grid, maxValue: gridMax, gamma: DENSITY_GAMMA };
}

/**
 * A hero's kills over all heroes' kills per cell, against the hero's share of all kills: 1 is the same share as
 * everywhere, 2 twice it. Drawn on a log scale around the middle of the ramp, so "more" and "less" sit symmetrically;
 * `maxValue` is the ratio the top of the ramp stands for (its bottom is the inverse).
 */
function normalizeShare(hero: Float32Array, all: Float32Array, percentile: number, minEvents: number) {
  const grid = new Float32Array(GRID_RES * GRID_RES);
  let heroTotal = 0;
  let allTotal = 0;
  for (let i = 0; i < grid.length; i++) {
    heroTotal += hero[i];
    allTotal += all[i];
  }
  if (heroTotal <= 0 || allTotal <= 0) return { grid, maxValue: 0, gamma: 1 };

  const share = heroTotal / allTotal;
  const minActivity = Math.max(1, minEvents);
  const logs = new Float32Array(grid.length);
  const magnitudes: number[] = [];
  for (let i = 0; i < grid.length; i++) {
    if (all[i] < minActivity) continue;
    logs[i] = Math.log((hero[i] + SHARE_PRIOR * share) / (all[i] + SHARE_PRIOR) / share);
    magnitudes.push(Math.abs(logs[i]));
  }
  magnitudes.sort((a, b) => a - b);
  // At least ±25%, so an even map does not stretch noise across the whole ramp.
  const bound = Math.max(
    Math.log(1.25),
    magnitudes[Math.floor(magnitudes.length * percentile)] ?? magnitudes.at(-1) ?? 0,
  );
  for (let i = 0; i < grid.length; i++) {
    if (all[i] < minActivity) continue;
    // Never exactly 0, which draws as no data.
    grid[i] = Math.max(0.01, 0.5 + 0.5 * Math.max(-1, Math.min(1, logs[i] / bound)));
  }
  return { grid, maxValue: Math.exp(bound), gamma: 1 };
}

/**
 * Normalize a copy so cached raw counts remain usable by tooltips and other views. A cell with fewer than `minEvents`
 * events (kills and deaths together for K/D, all heroes' kills for the share) stays empty, so a spot with two kills and
 * a death does not top the K/D map. The share view compares against `baseline`, the same filters for all heroes.
 */
export function normalizeHeatGrids(
  { killsRaw, deathsRaw }: HeatGrids,
  viewMode: HeatmapViewMode,
  sensitivity = 0.99,
  minEvents = 0,
  baseline?: HeatGrids,
): NormalizedHeatGrid {
  if (viewMode === "share") {
    if (!baseline) return { grid: new Float32Array(GRID_RES * GRID_RES), maxValue: 0, gamma: 1 };
    return normalizeShare(killsRaw, baseline.killsRaw, sensitivity, minEvents);
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

export function buildColorLUT(): Uint8Array {
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

export const COLOR_LUT = buildColorLUT();

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
