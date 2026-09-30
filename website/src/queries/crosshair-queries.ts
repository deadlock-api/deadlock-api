import { queryOptions } from "@tanstack/react-query";
import type { CrosshairApiSettingsCodeRequest, Settings } from "deadlock_api_client";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api, requestBlob, toApiError } from "~/lib/api";

import { queryKeys } from "./query-keys";

/** Every in-game crosshair share code starts with this. */
export const CROSSHAIR_CODE_PREFIX = "DL.";

/** A crosshair setting as a console command: `citadel_crosshair_dot_size 4`. */
const CONSOLE_COMMAND = /(^|[;\s])(citadel_)?crosshair_\w+\s+\S/;

/** Whether `code` looks like something the API reads as a crosshair: a share code or crosshair console commands. */
export function isCrosshairCode(code: string): boolean {
  return code.startsWith(CROSSHAIR_CODE_PREFIX) || CONSOLE_COMMAND.test(code);
}

export type CrosshairSettings = Required<Settings>;

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

/** The settings as query parameters of the generated client, which names them in camelCase. */
function toParams(s: CrosshairSettings): CrosshairApiSettingsCodeRequest {
  return {
    themed: s.themed,
    pipGapStatic: s.pip_gap_static,
    pipWidth: s.pip_width,
    pipHeight: s.pip_height,
    pipGap: s.pip_gap,
    pipOpacity: s.pip_opacity,
    pipOutlineBorder: s.pip_outline_border,
    pipOutlineGap: s.pip_outline_gap,
    pipOutlineOpacity: s.pip_outline_opacity,
    dotSize: s.dot_size,
    dotOpacity: s.dot_opacity,
    dotOutlineBorder: s.dot_outline_border,
    dotOutlineGap: s.dot_outline_gap,
    dotOutlineOpacity: s.dot_outline_opacity,
    colorR: s.color_r,
    colorG: s.color_g,
    colorB: s.color_b,
    outlineColorR: s.outline_color_r,
    outlineColorG: s.outline_color_g,
    outlineColorB: s.outline_color_b,
  };
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** The settings a share code carries, with the game's defaults for the rest. Enabled only for a crosshair code. */
export function crosshairCodeSettingsQueryOptions(code: string) {
  return queryOptions({
    queryKey: queryKeys.crosshair.codeSettings(code),
    queryFn: async ({ signal }): Promise<CrosshairSettings> => {
      const response = await api.crosshair_api.codeSettings({ code }, { signal }).catch(async (error: unknown) => {
        throw await toApiError(error);
      });
      return { ...DEFAULT_CROSSHAIR_SETTINGS, ...response.data };
    },
    enabled: isCrosshairCode(code),
    staleTime: CACHE_DURATIONS.FOREVER,
  });
}

/**
 * The PNG a share code draws at a screen height, as a data URL for an `<img>` (a crosshair is a few hundred bytes, and a
 * data URL needs no revoking). The image is a pure function of its inputs, so it never goes stale.
 */
export function crosshairCodeImageQueryOptions(code: string, screenHeight: number) {
  return queryOptions({
    queryKey: queryKeys.crosshair.codeImage(code, screenHeight),
    queryFn: async ({ signal }) =>
      toDataUrl(await requestBlob((options) => api.crosshair_api.codeImage({ code, screenHeight }, options), signal)),
    staleTime: CACHE_DURATIONS.FOREVER,
  });
}

/** The share code for the settings, to import them in game. */
export function crosshairCodeQueryOptions(settings: CrosshairSettings) {
  return queryOptions({
    queryKey: queryKeys.crosshair.code(settings),
    queryFn: async ({ signal }) => (await api.crosshair_api.settingsCode(toParams(settings), { signal })).data.code,
    staleTime: CACHE_DURATIONS.FOREVER,
  });
}
