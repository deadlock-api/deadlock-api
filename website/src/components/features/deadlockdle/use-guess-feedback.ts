import { useCallback, useEffect, useRef, useState } from "react";

type Feedback = "correct" | "wrong" | null;

/**
 * The flash and announcement of the last guess, cleared 900ms later. Each guess restarts the clock: with one timer per
 * guess, the first guess's timer cleared a quick second guess's message before it was read out.
 */
export function useGuessFeedback() {
  const [feedback, setFeedback] = useState<Feedback>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((next: Exclude<Feedback, null>) => {
    if (timer.current) clearTimeout(timer.current);
    setFeedback(next);
    timer.current = setTimeout(() => setFeedback(null), 900);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return [feedback, show] as const;
}
