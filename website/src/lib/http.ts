import { API_ORIGIN } from "~/lib/constants";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }

  /** The error for a failed response, with the message from its JSON body when it has one. */
  static fromResponse(status: number, statusText: string, body: unknown): ApiError {
    const fallback = `HTTP ${status}: ${statusText}`;
    const data = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
    const message = [data.message, data.error, data.detail].find((value): value is string => typeof value === "string");
    return new ApiError(status, message ?? fallback);
  }
}

/** Whether `error` is a 4xx from the API (an `ApiError` or an Axios error), which a retry will not fix. */
export function isClientError(error: unknown): boolean {
  // Axios's public error marker classifies errors without loading the HTTP client on pages that make no API requests.
  const isAxiosError =
    typeof error === "object" && error !== null && "isAxiosError" in error && error.isAxiosError === true;
  const status = isAxiosError
    ? (error as { response?: { status?: number } }).response?.status
    : error instanceof ApiError
      ? error.status
      : undefined;
  return status !== undefined && status >= 400 && status < 500;
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
