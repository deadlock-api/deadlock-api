import { extractSteamId, validateSteamResponse } from "~/lib/steam-auth";

interface SteamAuthCallbackResult {
  steamId64: string | null;
  openIdParams: Record<string, string>;
}

/**
 * Parses Steam OpenID callback parameters from the current URL on mount.
 * Returns the extracted Steam ID (64-bit) and all OpenID params if a valid callback is detected.
 * Each consumer is responsible for cleanup and further processing (e.g. converting to ID3, sending API requests).
 */
export function useSteamAuthCallback(): SteamAuthCallbackResult {
  if (typeof window === "undefined") {
    return { steamId64: null, openIdParams: {} };
  }

  const searchParams = new URLSearchParams(window.location.search);
  if (!validateSteamResponse(searchParams)) {
    return { steamId64: null, openIdParams: {} };
  }

  const claimedId = searchParams.get("openid.claimed_id");
  if (!claimedId) {
    return { steamId64: null, openIdParams: {} };
  }

  const steamId64 = extractSteamId(claimedId);
  if (!steamId64) {
    return { steamId64: null, openIdParams: {} };
  }

  const openIdParams: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    if (key.startsWith("openid.")) {
      openIdParams[key] = value;
    }
  });

  return { steamId64, openIdParams };
}
