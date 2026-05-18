import { useCallback, useEffect, useState } from "react";

export interface RateLimitState {
  limit: number | null;
  remaining: number | null;
  resetTime: number | null;
}

interface UseRateLimitReturn extends RateLimitState {
  decrementRemaining: () => void;
  syncFromHeaders: (headers: Headers) => void;
  parseHeaders: (headers: Headers) => Partial<RateLimitState>;
  isRateLimited: boolean;
  timeUntilReset: string | null;
}

const initialState: RateLimitState = {
  limit: null,
  remaining: null,
  resetTime: null,
};

export function useRateLimit(): UseRateLimitReturn {
  const [state, setState] = useState<RateLimitState>(initialState);
  const [currentTimeSeconds, setCurrentTimeSeconds] = useState<number | null>(null);

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
        setCurrentTimeSeconds(Math.floor(Date.now() / 1000));
        setState((prev) => ({
          ...prev,
          ...parsed,
        }));
      }
    },
    [parseHeaders],
  );

  useEffect(() => {
    if (state.resetTime === null) return;

    const interval = window.setInterval(() => {
      setCurrentTimeSeconds(Math.floor(Date.now() / 1000));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [state.resetTime]);

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
    if (state.resetTime === null || currentTimeSeconds === null) return null;

    const secondsRemaining = state.resetTime - currentTimeSeconds;

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
