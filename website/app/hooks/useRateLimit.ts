import { useCallback, useState } from "react";

/**
 * Rate limit state tracked from backend response headers
 */
export interface RateLimitState {
  /** Maximum number of requests allowed in the window */
  limit: number | null;
  /** Number of requests remaining in the current window */
  remaining: number | null;
  /** Unix timestamp (seconds) when the rate limit resets */
  resetTime: number | null;
}

interface UseRateLimitReturn extends RateLimitState {
  /** Optimistically decrement remaining count when sending a message */
  decrementRemaining: () => void;
  /** Sync state with backend rate limit headers from a response */
  syncFromHeaders: (headers: Headers) => void;
  /** Parse rate limit headers without updating state (for external use) */
  parseHeaders: (headers: Headers) => Partial<RateLimitState>;
  /** Check if the user is rate limited */
  isRateLimited: boolean;
  /** Time until reset in human-readable format (e.g., "45 minutes") */
  timeUntilReset: string | null;
}

const initialState: RateLimitState = {
  limit: null,
  remaining: null,
  resetTime: null,
};

export function useRateLimit(): UseRateLimitReturn {
  const [state, setState] = useState<RateLimitState>(initialState);

  const parseHeaders = useCallback((headers: Headers): Partial<RateLimitState> => {
    const result: Partial<RateLimitState> = {};

    const limitHeader = headers.get("X-RateLimit-Limit");
    if (limitHeader) {
      const parsed = Number.parseInt(limitHeader, 10);
      if (!Number.isNaN(parsed)) {
        result.limit = parsed;
      }
    }

    const remainingHeader = headers.get("X-RateLimit-Remaining");
    if (remainingHeader) {
      const parsed = Number.parseInt(remainingHeader, 10);
      if (!Number.isNaN(parsed)) {
        result.remaining = parsed;
      }
    }

    const resetHeader = headers.get("X-RateLimit-Reset");
    if (resetHeader) {
      const parsed = Number.parseInt(resetHeader, 10);
      if (!Number.isNaN(parsed)) {
        result.resetTime = parsed;
      }
    }

    return result;
  }, []);

  const syncFromHeaders = useCallback(
    (headers: Headers) => {
      const parsed = parseHeaders(headers);
      if (Object.keys(parsed).length > 0) {
        setState((prev) => ({
          ...prev,
          ...parsed,
        }));
      }
    },
    [parseHeaders],
  );

  const decrementRemaining = useCallback(() => {
    setState((prev) => {
      if (prev.remaining === null || prev.remaining <= 0) {
        return prev;
      }
      return {
        ...prev,
        remaining: prev.remaining - 1,
      };
    });
  }, []);

  const isRateLimited = state.remaining !== null && state.remaining <= 0;

  const timeUntilReset = (() => {
    if (state.resetTime === null) return null;

    const now = Math.floor(Date.now() / 1000);
    const secondsRemaining = state.resetTime - now;

    if (secondsRemaining <= 0) return null;

    const minutes = Math.ceil(secondsRemaining / 60);
    if (minutes < 60) {
      return `${minutes} minute${minutes === 1 ? "" : "s"}`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (remainingMinutes === 0) {
      return `${hours} hour${hours === 1 ? "" : "s"}`;
    }
    return `${hours} hour${hours === 1 ? "" : "s"} ${remainingMinutes} minute${remainingMinutes === 1 ? "" : "s"}`;
  })();

  return {
    ...state,
    decrementRemaining,
    syncFromHeaders,
    parseHeaders,
    isRateLimited,
    timeUntilReset,
  };
}
