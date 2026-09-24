import assert from "node:assert/strict";
import { test } from "node:test";

import { buildHeatGrids, summarizeHeatmap } from "./heatmap-grid";

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
