import type { Dayjs } from "~/dayjs";

/**
 * A self-contained English phrase: "between Jan 1 and Mar 3, 2026", "since Jan 1, 2026" or
 * "until Mar 3, 2026". Each case carries its own preposition, since only the two-ended one takes
 * "between".
 *
 * The locale is pinned: this phrase sits in English copy, and an implicit locale would also render
 * differently on the server than in the browser.
 */
export function formatDateRange(startDate: Dayjs | null | undefined, endDate: Dayjs | null | undefined): string | null {
  if (!startDate && !endDate) return null;
  const fmt = (d: Dayjs) =>
    d.toDate().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  const fmtShort = (d: Dayjs) => d.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric" });

  if (startDate && endDate) {
    const sameYear = startDate.year() === endDate.year();
    return `between ${sameYear ? fmtShort(startDate) : fmt(startDate)} and ${fmt(endDate)}`;
  }
  if (startDate) return `since ${fmt(startDate)}`;
  if (endDate) return `until ${fmt(endDate)}`;
  return null;
}
