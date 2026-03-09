/**
 * Data Privacy API Utilities
 * Handles API calls to the backend for data privacy requests
 */

import { fetchApi } from "~/lib/http";

export interface DataPrivacyRequest {
  steam_id: string;
  open_id_params: Record<string, string>;
}

export interface DataPrivacyResponse {
  success: boolean;
  message?: string;
  error?: string;
}

const PRIVACY_TIMEOUT = 30_000;

async function sendPrivacyRequest(
  path: string,
  requestData: DataPrivacyRequest,
  successMessage: string,
): Promise<DataPrivacyResponse> {
  try {
    await fetchApi(path, {
      method: "POST",
      body: requestData,
      timeout: PRIVACY_TIMEOUT,
      credentials: "same-origin",
    });
    return { success: true, message: successMessage };
  } catch (error) {
    console.error(`Error requesting ${path}:`, error);

    if (error instanceof Error && error.name === "AbortError") {
      return { success: false, error: "Request timed out. Please try again." };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error occurred",
    };
  }
}

/**
 * Send data deletion request to the backend
 * @param requestData - Steam ID and OpenID parameters for verification
 * @returns Promise resolving to the API response
 */
export async function requestDataDeletion(requestData: DataPrivacyRequest): Promise<DataPrivacyResponse> {
  return sendPrivacyRequest(
    "/v1/data-privacy/request-deletion",
    requestData,
    "Data deletion request submitted successfully",
  );
}

/**
 * Send tracking re-enablement request to the backend
 * @param requestData - Steam ID and OpenID parameters for verification
 * @returns Promise resolving to the API response
 */
export async function requestTrackingReEnable(requestData: DataPrivacyRequest): Promise<DataPrivacyResponse> {
  return sendPrivacyRequest(
    "/v1/data-privacy/request-tracking",
    requestData,
    "Tracking re-enablement request submitted successfully",
  );
}

/**
 * Send data privacy request based on action type
 * @param action - The type of request (deletion or tracking)
 * @param requestData - Steam ID and OpenID parameters for verification
 * @returns Promise resolving to the API response
 */
export async function sendDataPrivacyRequest(
  action: "deletion" | "tracking",
  requestData: DataPrivacyRequest,
): Promise<DataPrivacyResponse> {
  if (action === "deletion") {
    return requestDataDeletion(requestData);
  }
  return requestTrackingReEnable(requestData);
}
