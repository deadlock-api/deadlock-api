import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { inflateSync } from "node:zlib";

import { DEFAULT_CROSSHAIR_SETTINGS } from "../crosshair";
import { crosshairCodec } from "./crosshair";
import { loadWasmModule, WasmCallError } from "./module";

// Built by `pnpm build:wasm` (part of `pnpm test:unit`).
const wasm = readFileSync(new URL("../../wasm/crosshair-wasm.wasm", import.meta.url));
/** Codes exported by the game, and the API's reference renders of them. */
const FIXTURES = new URL("../../../../util-crates/crosshair/src/fixtures/", import.meta.url);

const codec = crosshairCodec(await loadWasmModule(wasm, ["decode", "encode", "render"]));

/** The settings in the fixture codes, as the crate's tests decode them. */
const SETTINGS = {
  teal_dot: {
    ...DEFAULT_CROSSHAIR_SETTINGS,
    pip_opacity: 0,
    pip_outline_opacity: 0,
    dot_size: 6,
    dot_opacity: 1,
    color_r: 2,
    color_g: 255,
    color_b: 242,
  },
  red_pips: {
    ...DEFAULT_CROSSHAIR_SETTINGS,
    pip_width: 3,
    pip_height: 10,
    pip_gap: 2,
    pip_opacity: 0.9,
    pip_outline_opacity: 1,
    dot_size: 2,
    color_r: 255,
    color_g: 40,
    color_b: 40,
  },
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

for (const [name, settings] of Object.entries(SETTINGS)) {
  test(`${name} decodes to its settings and back`, () => {
    const code = readFileSync(new URL(`${name}.txt`, FIXTURES), "utf8");
    assert.deepEqual(codec.decode(code), settings);
    assert.deepEqual(codec.decode(codec.encode(settings)), settings);
  });

  for (const height of [1080, 1440, 2160]) {
    test(`${name} at ${height}p matches the API's render`, () => {
      const expected = decodePng(readFileSync(new URL(`${name}_${height}.png`, FIXTURES)));
      const image = codec.render(settings, height);
      assert.ok(image);
      assert.equal(image.size, expected.width);
      assert.deepEqual(Buffer.from(image.pixels), Buffer.from(expected.pixels));
    });
  }
}

test("console commands decode on top of the defaults", () => {
  assert.deepEqual(codec.decode("citadel_crosshair_pip_width 5; citadel_crosshair_color_r 245"), {
    ...DEFAULT_CROSSHAIR_SETTINGS,
    pip_width: 5,
    color_r: 245,
  });
});

test("text that is not a crosshair code fails with the crate's message", () => {
  assert.throws(() => codec.decode("DL.AQDe"), new WasmCallError("Crosshair code is malformed"));
});

test("a crosshair too large to draw has no image", () => {
  assert.equal(codec.render({ ...DEFAULT_CROSSHAIR_SETTINGS, dot_size: 100_000 }, 1080), null);
});
