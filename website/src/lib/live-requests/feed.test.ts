import assert from "node:assert/strict";
import { test } from "node:test";

import { fitMap, ORIGIN, placeAt, project } from "./feed";
import { CLOUDFLARE_COLOS } from "./geo-data";

const SIZE = { width: 1600, height: 640 };
const IDENTITY = { scale: 1, x: 0, y: 0 };

function screenOf(lat: number, lon: number) {
  const [x, y] = project(fitMap(SIZE.width, SIZE.height), lat, lon);
  return { x, y };
}

const sydney = () => screenOf(CLOUDFLARE_COLOS.SYD[0], CLOUDFLARE_COLOS.SYD[1]);

test("placeAt names the data center under the point", () => {
  assert.deepEqual(placeAt(SIZE, IDENTITY, sydney(), 12), { kind: "colo", code: "SYD", city: "Sydney" });
});

test("placeAt picks our server on its disc over the data center beside it", () => {
  assert.deepEqual(placeAt(SIZE, IDENTITY, screenOf(ORIGIN.lat, ORIGIN.lon), 12), { kind: "origin" });
});

test("placeAt finds nothing in the open sea", () => {
  assert.equal(placeAt(SIZE, IDENTITY, screenOf(-40, -120), 12), null);
});

test("placeAt follows the zoom", () => {
  // Twice the size, the middle of the top half: Europe. Frankfurt is inland, so it is drawn where it is.
  const view = { scale: 2, x: -0.5, y: 0 };
  const { x, y } = screenOf(CLOUDFLARE_COLOS.FRA[0], CLOUDFLARE_COLOS.FRA[1]);
  const at = { x: 2 * x - 0.5 * SIZE.width, y: 2 * y };
  assert.deepEqual(placeAt(SIZE, view, at, 12), { kind: "colo", code: "FRA", city: "Frankfurt-am-Main" });
  assert.notDeepEqual(placeAt(SIZE, IDENTITY, at, 12), { kind: "colo", code: "FRA", city: "Frankfurt-am-Main" });
});
