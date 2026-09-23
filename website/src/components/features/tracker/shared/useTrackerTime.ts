import { type Dayjs, day } from "~/dayjs";
import { useHydrated } from "~/hooks/useHydrated";

export interface TrackerTime {
  /** True until hydration: the server renders in UTC, so the first client render has to as well. */
  utc: boolean;
  /** A unix timestamp as wall-clock time, in UTC until hydration and in the viewer's timezone after. */
  toTime: (unix: number) => Dayjs;
  /** The current time once hydrated; null before, as the server's clock never matches the client's. */
  now: Dayjs | null;
  /** "3 days ago" once hydrated; the absolute date before, which reads the same on server and client. */
  fromNow: (unix: number) => string;
}

/** Wall-clock time for tracker markup that server-renders identically and switches to local time after hydration. */
export function useTrackerTime(): TrackerTime {
  const hydrated = useHydrated();
  const toTime = hydrated ? (unix: number) => day.unix(unix) : (unix: number) => day.unix(unix).utc();
  const now = hydrated ? day() : null;
  return {
    utc: !hydrated,
    toTime,
    now,
    fromNow: (unix) => (now ? toTime(unix).from(now) : toTime(unix).format("MMM D, YYYY")),
  };
}
