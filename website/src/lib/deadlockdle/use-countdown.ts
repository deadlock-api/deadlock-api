import { useEffect, useState } from "react";

import { day } from "~/dayjs";

/**
 * Time left until the puzzle after `date` comes out (the next UTC midnight), as "HH:MM:SS", or null once it is out.
 * Counting to the day after the puzzle, not after the clock, keeps a page left open past midnight from announcing a
 * whole day's wait for a puzzle that is already live. Empty until the first tick, so the server renders no time.
 */
export function useCountdown(date: string): string | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  if (now == null) return "";
  const diff = Math.floor((day.utc(date).add(1, "day").valueOf() - now) / 1000);
  if (diff <= 0) return null;
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
