import assert from "node:assert/strict";
import { test } from "node:test";

import { buildHeatGrids, GRID_RES, normalizeHeatGrids, summarizeHeatmap } from "./heatmap-grid";

const RADIUS = 1000;
const point = (x: number, y: number, kills: number, deaths: number) =>
  ({ position_x: x, position_y: y, kills, deaths }) as Parameters<typeof buildHeatGrids>[0][number];

test("summarizeHeatmap counts the events and names the hottest ninth of the map", () => {
  // Kills gather in the top left (high y is the top of the drawn map), deaths in the bottom right.
  const data = [point(-800, 800, 5, 0), point(-790, 790, 4, 1), point(800, -800, 0, 7), point(0, 0, 1, 1)];
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

test("normalizeHeatGrids share puts the hero's even share mid-ramp and a lopsided spot at the top", () => {
  // Everyone kills 40 at each spot; the hero takes 30 of the left one (1.5x their half overall), 10 of the right (0.5x).
  const all = buildHeatGrids([point(-500, 0, 40, 0), point(500, 0, 40, 0)], RADIUS);
  const hero = buildHeatGrids([point(-500, 0, 30, 0), point(500, 0, 10, 0)], RADIUS);
  const { grid, maxValue, gamma } = normalizeHeatGrids(hero, "share", 1, 0, all);
  const row = 127 * GRID_RES;
  const left = Math.max(...grid.slice(row, row + GRID_RES / 2));
  const right = Math.min(...grid.slice(row, row + GRID_RES).filter((value) => value > 0));
  assert.equal(gamma, 1);
  assert.ok(maxValue > 1);
  assert.ok(left > 0.75, `left ${left}`);
  assert.ok(right < 0.1, `right ${right}`);
  assert.equal(
    normalizeHeatGrids(hero, "share", 1).grid.some((value) => value > 0),
    false,
  );
});
