import assert from "node:assert/strict";
import { test } from "node:test";

import { CHART_ZOOM_IDENTITY, clampChartZoom, zoomChartAt } from "./ChartZoom";

test("zooming keeps the point under the pointer in place", () => {
  const at = { x: 0.25, y: 0.75 };
  const view = zoomChartAt(CHART_ZOOM_IDENTITY, 2, at, 8);
  assert.equal(view.scale, 2);
  assert.ok(Math.abs(at.x * view.scale + view.x - at.x) < 1e-9);
  assert.ok(Math.abs(at.y * view.scale + view.y - at.y) < 1e-9);
});

test("zooming stops at the limits", () => {
  assert.equal(zoomChartAt(CHART_ZOOM_IDENTITY, 100, { x: 0.5, y: 0.5 }, 4).scale, 4);
  assert.deepEqual(zoomChartAt(CHART_ZOOM_IDENTITY, 0.5, { x: 0.5, y: 0.5 }, 4), CHART_ZOOM_IDENTITY);
});

test("the plot is never moved off the target's edges", () => {
  assert.deepEqual(clampChartZoom({ scale: 2, x: 0.5, y: -3 }, 8), { scale: 2, x: 0, y: -1 });
});
