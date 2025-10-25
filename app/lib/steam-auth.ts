/**
 * Steam OpenID Authentication Utilities
 * Handles Steam authentication flow for data privacy requests
 */

// Steam OpenID configuration
const STEAM_OPENID_URL = "https://steamcommunity.com/openid/login";

/**
 * Get the current domain for return URLs
 */
export function getCurrentDomain(): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  // Fallback for SSR
  return "https://deadlock-api.com";
}

/**
 * Generate Steam OpenID authentication URL
 * @param action - The action to perform after authentication (deletion or tracking)
 * @returns Steam authentication URL
 */
export function generateSteamAuthUrl(action: "deletion" | "tracking"): string {
  const currentDomain = getCurrentDomain();
  const returnUrl = `${currentDomain}/data-privacy?action=${action}`;

  const params = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": returnUrl,
    "openid.realm": currentDomain,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });

  return `${STEAM_OPENID_URL}?${params.toString()}`;
}

/**
 * Extract Steam ID from OpenID claimed_id URL
 * @param claimedId - The claimed_id from Steam OpenID response
 * @returns Steam ID as string or null if invalid
 */
export function extractSteamId(claimedId: string): string | null {
  const match = claimedId.match(/https:\/\/steamcommunity\.com\/openid\/id\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * Validate Steam OpenID response parameters
 * @param params - URLSearchParams from the callback
 * @returns boolean indicating if the response is valid
 */
export function validateSteamResponse(params: URLSearchParams): boolean {
  const requiredParams = [
    "openid.ns",
    "openid.mode",
    "openid.op_endpoint",
    "openid.claimed_id",
    "openid.identity",
    "openid.return_to",
    "openid.response_nonce",
    "openid.assoc_handle",
    "openid.signed",
    "openid.sig",
  ];

  // Check if all required parameters are present
  for (const param of requiredParams) {
    if (!params.has(param)) {
      return false;
    }
  }

  // Validate namespace
  if (params.get("openid.ns") !== "http://specs.openid.net/auth/2.0") {
    return false;
  }

  // Validate mode
  if (params.get("openid.mode") !== "id_res") {
    return false;
  }

  // Validate endpoint
  return params.get("openid.op_endpoint") === "https://steamcommunity.com/openid/login";
}

/**
 * Parse Steam OpenID callback parameters
 * @param searchParams - URL search parameters from the callback
 * @returns Parsed authentication data or null if invalid
 */
export function parseSteamCallback(searchParams: URLSearchParams): {
  action: "deletion" | "tracking";
  steamId: string;
  openIdParams: Record<string, string>;
} | null {
  const action = searchParams.get("action") as "deletion" | "tracking" | null;
  const claimedId = searchParams.get("openid.claimed_id");

  if (!action || !claimedId) {
    return null;
  }

  if (!validateSteamResponse(searchParams)) {
    return null;
  }

  const steamId = extractSteamId(claimedId);
  if (!steamId) {
    return null;
  }

  // Extract all OpenID parameters for backend verification
  const openIdParams: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    if (key.startsWith("openid.")) {
      openIdParams[key] = value;
    }
  });

  return {
    action,
    steamId,
    openIdParams,
  };
}

/**
 * Redirect to Steam authentication
 * @param action - The action to perform after authentication
 */
export function redirectToSteamAuth(action: "deletion" | "tracking"): void {
  if (typeof window === "undefined") {
    throw new Error("Steam authentication can only be initiated in the browser");
  }

  if (!action || (action !== "deletion" && action !== "tracking")) {
    throw new Error("Invalid action specified for Steam authentication");
  }

  try {
    window.location.href = generateSteamAuthUrl(action);
  } catch (error) {
    console.error(error);
    throw new Error("Failed to generate Steam authentication URL");
  }
}

/**
 * Clean up URL parameters after processing callback
 */
export function cleanupCallbackUrl(): void {
  if (typeof window === "undefined") return;

  // Remove all query parameters and replace the current history entry
  window.history.replaceState({}, document.title, window.location.pathname);
}
