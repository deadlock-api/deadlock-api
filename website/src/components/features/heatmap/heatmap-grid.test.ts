import assert from "node:assert/strict";
import { test } from "node:test";

import { buildHeatGrids, GRID_RES, normalizeHeatGrids, sampleBilinear, summarizeHeatmap } from "./heatmap-grid";

const RADIUS = 10752;
const point = (x: number, y: number, kills: number, deaths: number) =>
  ({ position_x: x, position_y: y, kills, deaths }) as Parameters<typeof buildHeatGrids>[0][number];

test("summarizeHeatmap counts the events and names the hottest ninth of the map", () => {
  // Kills gather in the top left (high y is the top of the drawn map), deaths in the bottom right.
  const data = [point(-8000, 8000, 5, 0), point(-7900, 7900, 4, 1), point(8000, -8000, 0, 7), point(0, 0, 1, 1)];
  const grids = buildHeatGrids(data, RADIUS);
  assert.equal(
    summarizeHeatmap(data, grids, "kills"),
    "10 kills and 9 deaths plotted; the most kills happen near the top left of the map.",
  );
  assert.match(summarizeHeatmap(data, grids, "deaths"), /the most deaths happen near the bottom right of the map\.$/);
  assert.match(summarizeHeatmap(data, grids, "kd"), /the most fighting happens/);
});

test("summarizeHeatmap without events only counts", () => {
  const grids = buildHeatGrids([], RADIUS);
  assert.equal(summarizeHeatmap([], grids, "kills"), "0 kills and 0 deaths plotted.");
});

test("normalizeHeatGrids leaves cells with fewer events than the minimum empty", () => {
  // A lone spot with two kills and a death next to a busy one with an even K/D.
  const data = [point(-500, 0, 2, 1), point(500, 0, 20, 20)];
  const grids = buildHeatGrids(data, RADIUS);
  const lit = (grid: Float32Array, from: number, to: number) => grid.slice(from, to).some((value) => value > 0);
  const row = 127 * GRID_RES;
  const all = normalizeHeatGrids(grids, "kd", 1).grid;
  assert.ok(lit(all, row, row + GRID_RES / 2));
  const filtered = normalizeHeatGrids(grids, "kd", 1, 5).grid;
  assert.ok(!lit(filtered, row, row + GRID_RES / 2));
  assert.ok(lit(filtered, row + GRID_RES / 2, row + GRID_RES));
});

test("normalizeHeatGrids K/D never rises as deaths grow with the kills fixed", () => {
  // Every cell holds 4 kills; deaths climb from 0 through slivers of a lone death to several.
  const cells = [0, 0.05, 0.1, 0.13, 0.2, 0.5, 1, 2, 4, 8];
  const { eventPeak } = buildHeatGrids([], RADIUS);
  const killsRaw = new Float32Array(GRID_RES * GRID_RES);
  const deathsRaw = new Float32Array(GRID_RES * GRID_RES);
  cells.forEach((deaths, i) => {
    killsRaw[i] = 4;
    deathsRaw[i] = deaths;
  });
  const { grid } = normalizeHeatGrids({ killsRaw, deathsRaw, eventPeak }, "kd", 1);
  for (let i = 1; i < cells.length; i++) {
    assert.ok(grid[i] <= grid[i - 1], `${cells[i]} deaths beat ${cells[i - 1]}`);
  }
  // A cell with deaths and no kills is drawn at the bottom of the ramp, not left empty.
  deathsRaw[0] = 4;
  killsRaw[0] = 0;
  const lowest = normalizeHeatGrids({ killsRaw, deathsRaw, eventPeak }, "kd", 1).grid[0];
  assert.ok(lowest > 0 && lowest < 0.1, `lowest ${lowest}`);
});

test("normalizeHeatGrids share puts the hero's even share mid-ramp and a lopsided spot at the top", () => {
  // Everyone kills 40 at each spot; the hero takes 30 of the left one (1.5x their half overall), 10 of the right (0.5x).
  const all = buildHeatGrids([point(-500, 0, 40, 0), point(500, 0, 40, 0)], RADIUS);
  const hero = buildHeatGrids([point(-500, 0, 30, 0), point(500, 0, 10, 0)], RADIUS);
  const { grid, maxValue, scale } = normalizeHeatGrids(hero, "share", 1, 0, all);
  const row = 127 * GRID_RES;
  const left = Math.max(...grid.slice(row, row + GRID_RES / 2));
  const right = Math.min(...grid.slice(row, row + GRID_RES).filter((value) => value > 0));
  assert.equal(scale, "ratio");
  assert.equal(maxValue, 2);
  assert.ok(left > 0.75, `left ${left}`);
  assert.ok(right < 0.1, `right ${right}`);
  assert.equal(
    normalizeHeatGrids(hero, "share", 1).grid.some((value) => value > 0),
    false,
  );
});

test("buildHeatGrids reads in events per API square", () => {
  // A 3 km field where every 128-unit square holds 10 kills: the middle of it reads 10, not the kernel's sum.
  const data = [];
  for (let x = -1536; x < 1536; x += 128) for (let y = -1536; y < 1536; y += 128) data.push(point(x, y, 10, 0));
  const { killsRaw } = buildHeatGrids(data, RADIUS);
  const middle = (GRID_RES - 1) / 2;
  const reading = sampleBilinear(killsRaw, GRID_RES, GRID_RES, middle, middle);
  assert.ok(Math.abs(reading - 10) < 0.5, `reading ${reading}`);
  // The grid holds every kill once, counted in the cells a square covers.
  const cellSize = (2 * RADIUS) / (GRID_RES - 1);
  const total = killsRaw.reduce((sum, value) => sum + value, 0) / (128 / cellSize) ** 2;
  assert.ok(Math.abs(total / (data.length * 10) - 1) < 0.01, `total ${total}`);
});
