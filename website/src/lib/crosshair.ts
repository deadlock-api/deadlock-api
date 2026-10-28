import type { CrosshairImage, CrosshairSettings } from "~/lib/wasm/crosshair";

/** Every in-game crosshair share code starts with this. */
export const CROSSHAIR_CODE_PREFIX = "DL.";

/** A crosshair setting as a console command: `citadel_crosshair_dot_size 4`. */
const CONSOLE_COMMAND = /(^|[;\s])(citadel_)?crosshair_\w+\s+\S/;

/** Whether `code` looks like something the crosshair module reads: a share code or crosshair console commands. */
export function isCrosshairCode(code: string): boolean {
  return code.startsWith(CROSSHAIR_CODE_PREFIX) || CONSOLE_COMMAND.test(code);
}

/** The game's defaults, which a code only overrides where it differs. */
export const DEFAULT_CROSSHAIR_SETTINGS: CrosshairSettings = {
  themed: false,
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
