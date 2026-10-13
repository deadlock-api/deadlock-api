import { ApiError } from "~/lib/api-error";
import { API_ORIGIN } from "~/lib/constants";
import { serverApiKeyHeaders } from "~/lib/server-api-key";

export { ApiError, isClientError, isServiceBusy, retryAfterMs, retryDelay, shouldRetry } from "~/lib/api-error";

interface FetchApiOptions {
  method?: string;
  body?: unknown;
  timeout?: number;
  credentials?: RequestCredentials;
}

/**
 * Fetch wrapper for the deadlock API with JSON handling and error extraction.
 * Defaults to credentials: "include" for authenticated endpoints.
 */
export async function fetchApi<T>(path: string, options?: FetchApiOptions): Promise<T> {
  const { method = "GET", body, timeout, credentials = "include" } = options ?? {};

  const controller = timeout ? new AbortController() : undefined;
  const timeoutId = timeout ? setTimeout(() => controller?.abort(), timeout) : undefined;

  try {
    const response = await fetch(`${API_ORIGIN}${path}`, {
      method,
      credentials,
      headers: { ...serverApiKeyHeaders(), ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller?.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw ApiError.fromResponse(response.status, response.statusText, errorData);
    }

    const text = await response.text();
    if (!text) return undefined as T;
    return JSON.parse(text);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
