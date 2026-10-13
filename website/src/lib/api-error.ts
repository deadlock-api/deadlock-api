// API error classification. Kept free of `~/lib/constants` (which reads `import.meta.env`) so plain Node tests can
// import it.

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
  const status = errorStatus(error);
  return status !== undefined && status >= 400 && status < 500;
}

/** The HTTP status of a failed API call (an `ApiError` or an Axios error), if it got a response. */
function errorStatus(error: unknown): number | undefined {
  if (error instanceof ApiError) return error.status;
  // Axios's public error marker classifies errors without loading the HTTP client on pages that make no API requests.
  const isAxiosError =
    typeof error === "object" && error !== null && "isAxiosError" in error && error.isAxiosError === true;
  return isAxiosError ? (error as { response?: { status?: number } }).response?.status : undefined;
}

/**
 * Whether `error` is the API shedding load: a 503 while its database is busy, or a 429 rate limit. Both say when to
 * come back in `Retry-After`.
 */
export function isServiceBusy(error: unknown): boolean {
  const status = errorStatus(error);
  return status === 503 || status === 429;
}

/** The `Retry-After` of a failed Axios call in milliseconds (only the seconds form, which the API sends). */
export function retryAfterMs(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("isAxiosError" in error)) return undefined;
  const headers = (error as { response?: { headers?: Record<string, unknown> } }).response?.headers;
  const seconds = Number(headers?.["retry-after"]);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined;
}

/**
 * React Query's retry policy for API calls: up to 3 retries, none for a 4xx a retry won't fix. On the server a busy
 * API is not retried either: that held the page for many seconds and added load while the API sheds it; the page
 * renders without that data (or the edge keeps its last good copy) and the browser fetches it after hydration.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 3 || isClientError(error)) return false;
  return typeof window !== "undefined" || !isServiceBusy(error);
}

/** React Query's default exponential backoff, but never sooner than the API's `Retry-After`. */
export function retryDelay(attempt: number, error: unknown): number {
  return Math.max(retryAfterMs(error) ?? 0, Math.min(1000 * 2 ** attempt, 30_000));
}
