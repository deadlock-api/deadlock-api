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

async function sendPrivacyRequest(path: string, requestData: DataPrivacyRequest): Promise<void> {
  try {
    await fetchApi(path, {
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

/**
 * Send data deletion request to the backend
 * @param requestData - Steam ID and OpenID parameters for verification
 */
export async function requestDataDeletion(requestData: DataPrivacyRequest): Promise<void> {
  return sendPrivacyRequest("/v1/data-privacy/request-deletion", requestData);
}

/**
 * Send tracking re-enablement request to the backend
 * @param requestData - Steam ID and OpenID parameters for verification
 */
export async function requestTrackingReEnable(requestData: DataPrivacyRequest): Promise<void> {
  return sendPrivacyRequest("/v1/data-privacy/request-tracking", requestData);
}

/**
 * Send data privacy request based on action type
 * @param action - The type of request (deletion or tracking)
 * @param requestData - Steam ID and OpenID parameters for verification
 */
export async function sendDataPrivacyRequest(
  action: "deletion" | "tracking",
  requestData: DataPrivacyRequest,
): Promise<void> {
  if (action === "deletion") {
    return requestDataDeletion(requestData);
  }
  return requestTrackingReEnable(requestData);
}
