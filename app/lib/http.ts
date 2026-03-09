import { API_ORIGIN } from "./constants";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

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
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller?.signal,
    });

    if (!response.ok) {
      const fallback = `HTTP ${response.status}: ${response.statusText}`;
      const errorData = await response.json().catch(() => ({ message: fallback }));
      throw new ApiError(response.status, errorData.message ?? errorData.error ?? errorData.detail ?? fallback);
    }

    const text = await response.text();
    if (!text) return undefined as T;
    return JSON.parse(text);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
