/**
 * Data Privacy API Utilities
 * Handles API calls to the backend for data privacy requests
 */

import { ApiError, fetchApi } from "~/lib/http";

export interface DataPrivacyRequest {
  steam_id: string;
  open_id_params: Record<string, string>;
}

const PRIVACY_TIMEOUT = 30_000;

const PRIVACY_PATHS = {
  deletion: "/v1/data-privacy/request-deletion",
  tracking: "/v1/data-privacy/request-tracking",
} as const;

/**
 * Send a data privacy request to the backend: data deletion, or tracking re-enablement
 * @param action - The type of request (deletion or tracking)
 * @param requestData - Steam ID and OpenID parameters for verification
 */
export async function sendDataPrivacyRequest(
  action: keyof typeof PRIVACY_PATHS,
  requestData: DataPrivacyRequest,
): Promise<void> {
  try {
    await fetchApi(PRIVACY_PATHS[action], {
      method: "POST",
      body: requestData,
      timeout: PRIVACY_TIMEOUT,
      credentials: "same-origin",
    });
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError(408, "Request timed out. Please try again.");
    }
    throw new ApiError(0, error instanceof Error ? error.message : "Failed to connect to server");
  }
}
