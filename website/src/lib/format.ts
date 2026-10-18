const CURRENCY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const DATE_TIME = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

export function formatCurrency(cents: number): string {
  return CURRENCY.format(cents / 100);
}

export function formatDate(dateString: string): string {
  return DATE_TIME.format(new Date(dateString));
}

/**
 * A moment as "2026-10-18 22:15 UTC": the same text on the server (which renders in UTC) and in every reader's
 * browser, with the zone said, for timestamps of data rather than of the reader's day.
 */
export function formatUtcDateTime(date: Date): string {
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);

  if (diffSec < 60) {
    return "just now";
  }
  if (diffMin < 60) {
    return `${diffMin} minute${diffMin !== 1 ? "s" : ""} ago`;
  }
  if (diffHr < 24) {
    return `${diffHr} hour${diffHr !== 1 ? "s" : ""} ago`;
  }
  if (diffDays < 30) {
    return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
  }
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) {
    return `${diffMonths} month${diffMonths !== 1 ? "s" : ""} ago`;
  }
  const diffYears = Math.floor(diffMonths / 12);
  return `${diffYears} year${diffYears !== 1 ? "s" : ""} ago`;
}

const COOLDOWN_DURATION_MS = 24 * 60 * 60 * 1000;

export function formatCooldownRemaining(deletedAt: string): string | null {
  const deletedDate = new Date(deletedAt);
  const cooldownEnd = new Date(deletedDate.getTime() + COOLDOWN_DURATION_MS);
  const now = new Date();
  const remainingMs = cooldownEnd.getTime() - now.getTime();

  if (remainingMs <= 0) {
    return null;
  }

  const remainingHours = Math.floor(remainingMs / (1000 * 60 * 60));
  const remainingMinutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));

  if (remainingHours > 0) {
    return `${remainingHours}h ${remainingMinutes}m`;
  }
  // The last minute read as "0m", as if the cooldown were already over.
  return remainingMinutes > 0 ? `${remainingMinutes}m` : "< 1m";
}

/** Formats a ratio in `[0,1]` as a percentage, e.g. `52.6%`. */
export function formatPercent(ratio: number, digits = 1): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}

/** Formats a share as a whole percentage, printing a nonzero share that would round to "0%" as "<1%". */
export function formatShare(ratio: number): string {
  return ratio > 0 && ratio < 0.005 ? "<1%" : formatPercent(ratio, 0);
}

/**
 * Decimals that keep two significant digits of a small percentage (0.0886% -> 3, 0.00029% -> 5) and one decimal from
 * 1% up, capped at six.
 */
export function fineShareDigits(ratio: number): number {
  const percent = Math.abs(ratio * 100);
  if (!(percent > 0) || percent >= 1) return 1;
  return Math.min(6, 1 - Math.floor(Math.log10(percent)));
}

/**
 * Formats a share that is often far below 1%, such as one item pair out of millions, e.g. `0.00029%`, `0.089%` or
 * `16.2%`. A nonzero share below the six-decimal floor prints as "<0.000001%" rather than as zero.
 */
export function formatFineShare(ratio: number): string {
  if (ratio > 0 && ratio < 0.000_000_005) return "<0.000001%";
  return formatPercent(ratio, fineShareDigits(ratio));
}

/**
 * Formats a ratio as a signed percentage, deciding the sign after rounding so a tiny change never prints as "-0.0%".
 * Negative values take the minus sign (U+2212) that `Delta` prints, so the two never sit side by side as - and −.
 */
export function formatSignedPercent(ratio: number, digits = 1): string {
  const factor = 10 ** digits;
  const percent = Math.round(ratio * 100 * factor) / factor;
  const sign = percent > 0 ? "+" : percent < 0 ? "\u2212" : "";
  return `${sign}${Math.abs(percent).toFixed(digits)}%`;
}

/**
 * A difference of two rates in percentage points: 0.168 renders as +16.8 pp. Keeps a win rate's lead apart from a
 * relative change ("+16.8%" of 52% would be 61%, not 69%).
 */
export function formatSignedPoints(difference: number, digits = 1): string {
  return `${formatSignedPercent(difference, digits).slice(0, -1)}\u00a0pp`;
}

/** "Toxic Bullets'" rather than "Toxic Bullets's"; item names ending in s are mostly plurals. */
export function possessive(name: string): string {
  return name.endsWith("s") ? `${name}'` : `${name}'s`;
}

/** "Tank" from "tank": the first letter upper-cased, the rest left as it is. */
export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const PLURAL = new Intl.PluralRules("en-US");

/** A count with its noun in the right number: "1 point", "3 points", "0 points". `plural` defaults to `singular` + s. */
export function formatCountNoun(count: number, singular: string, plural = `${singular}s`): string {
  return `${count.toLocaleString("en-US")} ${PLURAL.select(count) === "one" ? singular : plural}`;
}

/**
 * A range of two formatted values with an en dash: "12–34". Spaced when either end has a space or a sign of its own
 * ("−3 – 5", "1 min – 2 min"), so the dash never reads as a minus.
 */
export function formatRange(low: string, high: string): string {
  return /[\s\-−]/.test(low + high) ? `${low} – ${high}` : `${low}–${high}`;
}
