import type { Dayjs } from "~/dayjs";

/**
 * A self-contained English phrase: "between Jan 1 and Mar 3, 2026", "since Jan 1, 2026" or
 * "until Mar 3, 2026". Each case carries its own preposition, since only the two-ended one takes
 * "between".
 *
 * Dayjs formats in English (no other locale is loaded), the same on the server as in the browser.
 */
export function formatDateRange(startDate: Dayjs | null | undefined, endDate: Dayjs | null | undefined): string | null {
  if (!startDate && !endDate) return null;
  // Dayjs formats in the date's own mode: a whole UTC day from the URL stays that day west of UTC.
  const fmt = (d: Dayjs) => d.format("MMM D, YYYY");
  const fmtShort = (d: Dayjs) => d.format("MMM D");

  if (startDate && endDate) {
    const sameYear = startDate.year() === endDate.year();
    return `between ${sameYear ? fmtShort(startDate) : fmt(startDate)} and ${fmt(endDate)}`;
  }
  if (startDate) return `since ${fmt(startDate)}`;
  if (endDate) return `until ${fmt(endDate)}`;
  return null;
}
