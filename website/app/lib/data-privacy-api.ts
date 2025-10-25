/**
 * Data Privacy API Utilities
 * Handles API calls to the backend for data privacy requests
 */

import { API_ORIGIN } from "./constants";

export interface DataPrivacyRequest {
  steam_id: string;
  open_id_params: Record<string, string>;
}

export interface DataPrivacyResponse {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * Send data deletion request to the backend
 * @param requestData - Steam ID and OpenID parameters for verification
 * @returns Promise resolving to the API response
 */
export async function requestDataDeletion(requestData: DataPrivacyRequest): Promise<DataPrivacyResponse> {
  try {
    const url = `${API_ORIGIN}/v1/data-privacy/request-deletion`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestData),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.message || `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    return {
      success: true,
      message: "Data deletion request submitted successfully",
    };
  } catch (error) {
    console.error("Error requesting data deletion:", error);

    if (error instanceof Error && error.name === "AbortError") {
      return {
        success: false,
        error: "Request timed out. Please try again.",
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error occurred",
    };
  }
}

/**
 * Send tracking re-enablement request to the backend
 * @param requestData - Steam ID and OpenID parameters for verification
 * @returns Promise resolving to the API response
 */
export async function requestTrackingReEnable(requestData: DataPrivacyRequest): Promise<DataPrivacyResponse> {
  try {
    const url = `${API_ORIGIN}/v1/data-privacy/request-tracking`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestData),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.message || `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    return {
      success: true,
      message: "Tracking re-enablement request submitted successfully",
    };
  } catch (error) {
    console.error("Error requesting tracking re-enablement:", error);

    if (error instanceof Error && error.name === "AbortError") {
      return {
        success: false,
        error: "Request timed out. Please try again.",
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error occurred",
    };
  }
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
  } else {
    return requestTrackingReEnable(requestData);
  }
}
