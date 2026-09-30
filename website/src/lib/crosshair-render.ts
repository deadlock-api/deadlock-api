/**
 * Draws a crosshair from its settings the way the game's HUD does, pixel for pixel the same as the API's renderer, so
 * the editor can redraw on every slider step without a request.
 *
 * **Twin implementation:** this is a line-by-line port of `api/src/services/crosshair/render.rs`. Any change to either
 * must be made to both, in the same commit. `crosshair-render.test.ts` checks this file against the Rust renderer's
 * PNGs in `api/src/services/crosshair/fixtures/`.
 *
 * The layout mirrors the reticle panels in the game's client: a round dot with a ring outline in the centre and four
 * pips around it, each with a rectangular outline. Lengths are in units of 1/1080 of the screen height. Each pixel is
 * covered by a 16x16 grid of samples.
 *
 * The Rust renderer computes in 32-bit floats, so every arithmetic step here is rounded with `f` (`Math.fround`)
 * exactly where Rust rounds. Changing the order of an expression changes pixels; keep it in step with `render.rs`.
 */

/** The crosshair convars the renderer reads; the API's `Settings` has these fields. */
export interface CrosshairRenderSettings {
  pip_gap_static: boolean;
  pip_width: number;
  pip_height: number;
  pip_gap: number;
  pip_opacity: number;
  pip_outline_border: number;
  pip_outline_gap: number;
  pip_outline_opacity: number;
  dot_size: number;
  dot_opacity: number;
  dot_outline_border: number;
  dot_outline_gap: number;
  dot_outline_opacity: number;
  color_r: number;
  color_g: number;
  color_b: number;
  outline_color_r: number;
  outline_color_g: number;
  outline_color_b: number;
}

/** An RGBA image, four bytes per pixel, row by row. */
export interface CrosshairImage {
  size: number;
  pixels: Uint8ClampedArray;
}

const f = Math.fround;

/** Samples per pixel along each axis. */
const SUBSAMPLES = 16;
const SAMPLES = SUBSAMPLES * SUBSAMPLES;
/** Layout units per screen: lengths scale with `screenHeight / REFERENCE_HEIGHT`. */
const REFERENCE_HEIGHT = 1080;
/** Transparent padding around the crosshair, in pixels. */
const PADDING = 2;
/** Largest image edge drawn; real crosshairs are well under 200 px even at 4K. */
const MAX_IMAGE_SIZE = 1024;
const MIN_ALPHA = f(1e-9);

type Rgb = readonly [number, number, number];

/** One filled shape, or a hollow one when `border > 0`, centred at (`cx`, `cy`) in layout units. */
interface Shape {
  cx: number;
  cy: number;
  w: number;
  h: number;
  border: number;
  round: boolean;
  color: Rgb;
  opacity: number;
}

/** The size of the hole of a hollow shape. */
function hole(shape: Shape): [number, number] | null {
  const twice = f(2 * shape.border);
  return shape.border > 0 && shape.w > twice ? [f(shape.w - twice), f(shape.h - twice)] : null;
}

/** Rust's `f32::round_ties_even`: halves go to the even neighbour, not up. */
function roundTiesEven(value: number): number {
  const rounded = Math.round(value);
  return Math.abs(value % 1) === 0.5 && rounded % 2 !== 0 ? rounded - 1 : rounded;
}

/** A PNG data URL of `image`, for an `<img>`. Browser only: it draws on a canvas. */
export function toPngDataUrl(image: CrosshairImage): string {
  const canvas = document.createElement("canvas");
  canvas.width = image.size;
  canvas.height = image.size;
  const pixels = new Uint8ClampedArray(image.pixels.length);
  pixels.set(image.pixels);
  canvas.getContext("2d")?.putImageData(new ImageData(pixels, image.size, image.size), 0, 0);
  return canvas.toDataURL("image/png");
}

/** The crosshair on a screen `screenHeight` pixels tall, or `null` when it is too large to draw. */
export function renderCrosshair(settings: CrosshairRenderSettings, screenHeight: number): CrosshairImage | null {
  const scale = f(screenHeight / REFERENCE_HEIGHT);
  const shapes = layout(settings, screenHeight).filter((shape) => shape.opacity > 0);

  // How far the visible shapes reach from the centre, in pixels.
  let reach = 0;
  for (const s of shapes) {
    const edge = Math.max(f(Math.abs(s.cx) + f(s.w / 2)), f(Math.abs(s.cy) + f(s.h / 2)));
    reach = Math.max(reach, f(edge * scale));
  }
  const extent = Math.ceil(reach);
  if (extent > MAX_IMAGE_SIZE / 2 - PADDING) return null;

  const grid = new Grid(extent + PADDING, scale);
  const canvas = new Float32Array(grid.size * grid.size * 4);
  for (const shape of shapes) {
    if (shape.w > 0 && shape.h > 0) paint(canvas, grid, shape);
  }
  return { size: grid.size, pixels: toBytes(canvas) };
}

/** The shapes making up the crosshair, in the order the game paints them. */
function layout(s: CrosshairRenderSettings, screenHeight: number): Shape[] {
  const color: Rgb = [f(s.color_r / 255), f(s.color_g / 255), f(s.color_b / 255)];
  const outlineColor: Rgb = [f(s.outline_color_r / 255), f(s.outline_color_g / 255), f(s.outline_color_b / 255)];
  const opacity = (value: number) => Math.min(Math.max(f(value), 0), 1);
  const outlineOpacity = (border: number, value: number) => (border > 0 ? opacity(value) : 0);

  const dot = Math.trunc(s.dot_size);
  const dotBorder = Math.trunc(s.dot_outline_border);
  const dotRing = f(f(f(2 * dotBorder) + Math.trunc(s.dot_outline_gap)) + dot);

  // Pips sit round(3H/480) + max(gap, -14) + 4 units from the centre. A static gap applies the -14 floor to the sum.
  const base = roundTiesEven(f(f(3 * screenHeight) / 480));
  const gap = Math.trunc(s.pip_gap);
  const offset = f(4 + (s.pip_gap_static ? Math.max(f(base + gap), f(base - 14)) : f(base + Math.max(gap, -14))));
  const pipWidth = Math.trunc(s.pip_width);
  const pipHeight = Math.trunc(s.pip_height);
  const pipBorder = Math.trunc(s.pip_outline_border);
  const pipGrow = f(f(2 * pipBorder) + Math.trunc(s.pip_outline_gap));

  const pip = (cx: number, cy: number, horizontal: boolean): Shape[] => {
    const [w, h] = horizontal ? [pipHeight, pipWidth] : [pipWidth, pipHeight];
    const fill: Shape = { cx, cy, w, h, border: 0, round: false, color, opacity: opacity(s.pip_opacity) };
    const outline: Shape = {
      ...fill,
      w: f(w + pipGrow),
      h: f(h + pipGrow),
      border: pipBorder,
      color: outlineColor,
      opacity: outlineOpacity(pipBorder, s.pip_outline_opacity),
    };
    return [fill, outline];
  };

  return [
    {
      cx: 0,
      cy: 0,
      w: dotRing,
      h: dotRing,
      border: dotBorder,
      round: true,
      color: outlineColor,
      opacity: outlineOpacity(dotBorder, s.dot_outline_opacity),
    },
    { cx: 0, cy: 0, w: dot, h: dot, border: 0, round: true, color, opacity: opacity(s.dot_opacity) },
    ...pip(0, -offset, false),
    ...pip(offset, 0, true),
    ...pip(0, offset, false),
    ...pip(-offset, 0, true),
  ];
}

/** A square image of `size` pixels whose centre is the crosshair's centre. */
class Grid {
  readonly size: number;
  readonly half: number;

  constructor(
    half: number,
    readonly scale: number,
  ) {
    this.size = 2 * half;
    this.half = half;
  }

  /** Layout-unit coordinate of sample `sub` of `pixel`, relative to `center`. */
  sample(pixel: number, sub: number, center: number): number {
    return f(f(f(f(f(pixel + sub / SUBSAMPLES) + 0.5 / SUBSAMPLES) - this.half) / this.scale) - center);
  }

  /** The pixels along one axis that can hold samples within `reach` units of `center`, with a rounding margin. */
  span(center: number, reach: number): [number, number] {
    const toPixel = (unit: number) => f(f(unit * this.scale) + this.half);
    const start = Math.max(Math.floor(toPixel(f(center - reach))) - 2, 0);
    const end = Math.max(Math.ceil(toPixel(f(center + reach))) + 2, 0);
    return [Math.min(start, this.size), Math.min(end, this.size)];
  }
}

/** Composites `shape` over the premultiplied canvas. */
function paint(canvas: Float32Array, grid: Grid, shape: Shape) {
  const columns = grid.span(shape.cx, f(shape.w / 2));
  const rows = grid.span(shape.cy, f(shape.h / 2));
  const coverage = shape.round ? roundCoverage(grid, shape, columns, rows) : rectCoverage(grid, shape, columns, rows);
  const width = columns[1] - columns[0];

  for (let y = rows[0]; y < rows[1]; y++) {
    for (let x = columns[0]; x < columns[1]; x++) {
      const hits = coverage[(y - rows[0]) * width + (x - columns[0])] ?? 0;
      if (hits === 0) continue;
      const alpha = f(f(shape.opacity * hits) / SAMPLES);
      const keep = f(1 - alpha);
      const at = (y * grid.size + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        canvas[at + channel] = f(f(shape.color[channel] * alpha) + f((canvas[at + channel] ?? 0) * keep));
      }
      canvas[at + 3] = f(alpha + f((canvas[at + 3] ?? 0) * keep));
    }
  }
}

/**
 * Covered samples per pixel of an axis-aligned rectangle, row-major over `columns` x `rows`. Rectangles are separable:
 * a sample is inside when its x and its y both are, so the count is the product of per-axis counts, minus the samples
 * that also fall in the hole.
 */
function rectCoverage(grid: Grid, shape: Shape, columns: [number, number], rows: [number, number]): Uint16Array {
  const holeSize = hole(shape);
  const axis = ([from, to]: [number, number], center: number, outer: number, holeLength: number | undefined) => {
    const counts: [number, number][] = [];
    const outerHalf = f(outer / 2);
    const holeHalf = holeLength === undefined ? undefined : f(holeLength / 2);
    for (let pixel = from; pixel < to; pixel++) {
      let inside = 0;
      let inHole = 0;
      for (let sub = 0; sub < SUBSAMPLES; sub++) {
        const v = Math.abs(grid.sample(pixel, sub, center));
        if (v <= outerHalf) {
          inside++;
          if (holeHalf !== undefined && v <= holeHalf) inHole++;
        }
      }
      counts.push([inside, inHole]);
    }
    return counts;
  };
  const xs = axis(columns, shape.cx, shape.w, holeSize?.[0]);
  const ys = axis(rows, shape.cy, shape.h, holeSize?.[1]);
  const coverage = new Uint16Array(xs.length * ys.length);
  ys.forEach(([y, yHole], row) =>
    xs.forEach(([x, xHole], column) => {
      coverage[row * xs.length + column] = x * y - xHole * yHole;
    }),
  );
  return coverage;
}

/** Squared sample offsets of one pixel along one axis, with their extremes. */
interface Squares {
  values: number[];
  min: number;
  max: number;
}

/**
 * Covered samples per pixel of a disc or ring, row-major over `columns` x `rows`. Float addition is monotonic, so a
 * pixel whose nearest sample is outside a circle or whose farthest sample is inside it is decided without visiting
 * every sample; only pixels on an edge are sampled in full.
 */
function roundCoverage(grid: Grid, shape: Shape, columns: [number, number], rows: [number, number]): Uint16Array {
  const radiusSq = f(f(shape.w * shape.w) / 4);
  const holeSize = hole(shape);
  const holeSq = holeSize ? f(f(holeSize[0] * holeSize[0]) / 4) : undefined;
  const squares = ([from, to]: [number, number], center: number): Squares[] => {
    const result: Squares[] = [];
    for (let pixel = from; pixel < to; pixel++) {
      const values = Array.from({ length: SUBSAMPLES }, (_, sub) => {
        const v = grid.sample(pixel, sub, center);
        return f(v * v);
      });
      result.push({ values, min: Math.min(...values), max: Math.max(0, ...values) });
    }
    return result;
  };
  // Samples of the pixel within `limit`: all, none, or `null` when the pixel straddles it.
  const bulk = (x: Squares, y: Squares, limit: number) => {
    if (f(x.min + y.min) > limit) return 0;
    if (f(x.max + y.max) <= limit) return SAMPLES;
    return null;
  };
  const xs = squares(columns, shape.cx);
  const ys = squares(rows, shape.cy);
  const coverage = new Uint16Array(xs.length * ys.length);
  ys.forEach((y, row) =>
    xs.forEach((x, column) => {
      const inside = bulk(x, y, radiusSq);
      const inHole = holeSq === undefined ? 0 : bulk(x, y, holeSq);
      let hits: number;
      if (inside === 0) {
        hits = 0;
      } else if (inside !== null && inHole !== null) {
        // Every sample is inside the circle, so the hole's samples are all it loses.
        hits = inside - inHole;
      } else {
        hits = 0;
        for (const yy of y.values) {
          for (const xx of x.values) {
            const d = f(xx + yy);
            if (d <= radiusSq && !(holeSq !== undefined && d <= holeSq)) hits++;
          }
        }
      }
      coverage[row * xs.length + column] = hits;
    }),
  );
  return coverage;
}

/** Un-premultiplies the canvas into 8-bit RGBA. */
function toBytes(canvas: Float32Array): Uint8ClampedArray {
  // Rust's `round` goes half away from zero, the same as `Math.round` for the non-negative values here.
  const toByte = (value: number) => Math.min(Math.max(Math.round(f(value * 255)), 0), 255);
  const bytes = new Uint8ClampedArray(canvas.length);
  for (let at = 0; at < canvas.length; at += 4) {
    const alpha = canvas[at + 3] ?? 0;
    const divisor = Math.max(alpha, MIN_ALPHA);
    for (let channel = 0; channel < 3; channel++) {
      bytes[at + channel] = toByte(f((canvas[at + channel] ?? 0) / divisor));
    }
    bytes[at + 3] = toByte(alpha);
  }
  return bytes;
}
