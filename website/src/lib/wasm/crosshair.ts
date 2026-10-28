import { WasmCallError, type WasmModule } from "./module";

/** The crosshair convars, as the `crosshair-wasm` module (`wasm/crosshair`) trades them; named like the API's `Settings`. */
export interface CrosshairSettings {
  /** Use the hero's own crosshair instead of these settings. */
  themed: boolean;
  /** Keep the pips at a fixed distance instead of spreading them with weapon spread. */
  pip_gap_static: boolean;
  pip_width: number;
  pip_height: number;
  pip_gap: number;
  /** 0 to 1. */
  pip_opacity: number;
  pip_outline_border: number;
  pip_outline_gap: number;
  /** 0 to 1. */
  pip_outline_opacity: number;
  dot_size: number;
  /** 0 to 1. */
  dot_opacity: number;
  dot_outline_border: number;
  dot_outline_gap: number;
  /** 0 to 1. */
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

export interface CrosshairCodec {
  /** Reads a share code (`DL.…`) or crosshair console commands; throws a `WasmCallError` for text that is neither. */
  decode: (code: string) => CrosshairSettings;
  /** Writes the share code the game imports. */
  encode: (settings: CrosshairSettings) => string;
  /**
   * The crosshair on a screen `screenHeight` pixels tall, pixel for pixel as the game and the API draw it, or `null`
   * when it is too large to draw.
   */
  render: (settings: CrosshairSettings, screenHeight: number) => CrosshairImage | null;
}

export function crosshairCodec(module: WasmModule<"decode" | "encode" | "render">): CrosshairCodec {
  return {
    decode: (code) => JSON.parse(module.call("decode", code)) as CrosshairSettings,
    encode: (settings) => module.call("encode", JSON.stringify(settings)),
    render(settings, screenHeight) {
      let output;
      try {
        output = module.call("render", JSON.stringify({ settings, screen_height: screenHeight }));
      } catch (error) {
        if (error instanceof WasmCallError) return null;
        throw error;
      }
      const { size, pixels } = JSON.parse(output) as { size: number; pixels: string };
      return { size, pixels: Uint8ClampedArray.from(atob(pixels), (char) => char.charCodeAt(0)) };
    },
  };
}
