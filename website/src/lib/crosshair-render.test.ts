import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { inflateSync } from "node:zlib";

import { type CrosshairRenderSettings, renderCrosshair } from "./crosshair-render";

/** The API's reference renders, which the website's renderer must match pixel for pixel. */
const FIXTURES = new URL("../../../api/src/services/crosshair/fixtures/", import.meta.url);

const DEFAULTS: CrosshairRenderSettings = {
  pip_gap_static: false,
  pip_width: 2,
  pip_height: 16,
  pip_gap: 4,
  pip_opacity: 0.5,
  pip_outline_border: 1,
  pip_outline_gap: 0,
  pip_outline_opacity: 0.7,
  dot_size: 4,
  dot_opacity: 0.7,
  dot_outline_border: 2,
  dot_outline_gap: 0,
  dot_outline_opacity: 0.7,
  color_r: 255,
  color_g: 255,
  color_b: 255,
  outline_color_r: 0,
  outline_color_g: 0,
  outline_color_b: 0,
};

/** The settings in the fixture codes, as the API's tests decode them. */
const TEAL_DOT = {
  ...DEFAULTS,
  pip_opacity: 0,
  pip_outline_opacity: 0,
  dot_size: 6,
  dot_opacity: 1,
  color_r: 2,
  color_g: 255,
  color_b: 242,
};
const RED_PIPS = {
  ...DEFAULTS,
  pip_width: 3,
  pip_height: 10,
  pip_gap: 2,
  pip_opacity: 0.9,
  pip_outline_opacity: 1,
  dot_size: 2,
  color_r: 255,
  color_g: 40,
  color_b: 40,
};

/** Decodes an 8-bit RGBA, non-interlaced PNG, the only kind the fixtures are. */
function decodePng(file: Buffer): { width: number; pixels: Uint8Array } {
  let at = 8;
  let width = 0;
  let height = 0;
  const data: Buffer[] = [];
  while (at < file.length) {
    const length = file.readUInt32BE(at);
    const type = file.toString("ascii", at + 4, at + 8);
    const body = file.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      assert.deepEqual([body[8], body[9], body[12]], [8, 6, 0], "8-bit RGBA, not interlaced");
    }
    if (type === "IDAT") data.push(body);
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * 4;
  const pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const byte = raw[y * (stride + 1) + 1 + x] ?? 0;
      const left = x >= 4 ? (pixels[y * stride + x - 4] ?? 0) : 0;
      const up = y > 0 ? (pixels[(y - 1) * stride + x] ?? 0) : 0;
      const upLeft = x >= 4 && y > 0 ? (pixels[(y - 1) * stride + x - 4] ?? 0) : 0;
      const paeth = () => {
        const p = left + up - upLeft;
        const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upLeft)];
        return pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      };
      const predictor = [0, left, up, (left + up) >> 1, paeth()][filter ?? 0] ?? 0;
      pixels[y * stride + x] = (byte + predictor) & 255;
    }
  }
  return { width, pixels };
}

for (const [name, settings] of [
  ["teal_dot", TEAL_DOT],
  ["red_pips", RED_PIPS],
] as const) {
  for (const height of [1080, 1440, 2160]) {
    test(`${name} at ${height}p matches the API's render`, () => {
      const expected = decodePng(readFileSync(new URL(`${name}_${height}.png`, FIXTURES)));
      const image = renderCrosshair(settings, height);
      assert.ok(image);
      assert.equal(image.size, expected.width);
      assert.deepEqual(Buffer.from(image.pixels), Buffer.from(expected.pixels));
    });
  }
}

test("a crosshair too large to draw has no image", () => {
  assert.equal(renderCrosshair({ ...DEFAULTS, dot_size: 100_000 }, 1080), null);
});

test("an invisible crosshair is only its padding", () => {
  const image = renderCrosshair(
    { ...DEFAULTS, pip_opacity: 0, pip_outline_opacity: 0, dot_opacity: 0, dot_outline_opacity: 0 },
    1080,
  );
  assert.equal(image?.size, 4);
  assert.ok(image?.pixels.every((byte) => byte === 0));
});
