/**
 * When the yearly recap is open: from 1 December of the year it covers through 15 January of the next (UTC dates,
 * both inclusive). The rest of the year the pages say when it opens. Pure: the caller passes the clock.
 */

/** The first year the API has a recap for. */
export const FIRST_RECAP_YEAR = 2026;

const DECEMBER = 11;
const JANUARY = 0;
/** The last day of January the previous year's recap stays open. */
export const RECAP_LAST_JANUARY_DAY = 15;

/**
 * The year a recap covers on `now`: that year in December, the year before through 15 January, and otherwise the
 * year in progress (the one whose recap opens next December).
 */
export function recapYear(now: Date): number {
  const year = now.getUTCFullYear();
  const covered = now.getUTCMonth() === JANUARY && now.getUTCDate() <= RECAP_LAST_JANUARY_DAY ? year - 1 : year;
  return Math.max(FIRST_RECAP_YEAR, covered);
}

/** Whether the recap is open on `now`: 1 December to 15 January, UTC. */
export function isRecapOpen(now: Date): boolean {
  const month = now.getUTCMonth();
  return month === DECEMBER || (month === JANUARY && now.getUTCDate() <= RECAP_LAST_JANUARY_DAY);
}

/** The recap of `year` as the pages name its window, in a fixed locale so server and client print the same. */
export function recapWindowLabel(year: number): { opens: string; closes: string } {
  return { opens: `1 December ${year}`, closes: `${RECAP_LAST_JANUARY_DAY} January ${year + 1}` };
}
