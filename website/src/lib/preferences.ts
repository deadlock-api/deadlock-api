export const PREFERENCES_COOKIE = "preferences";

const DATE_FILTERS = ["season", "patch"] as const;

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

// Fields are optional; unknown fields survive updates from older clients. It rides in the router context, so it
// stays JSON.
export interface Preferences {
  dateFilter?: (typeof DATE_FILTERS)[number];
  [field: string]: Json | undefined;
}

/**
 * The cookie's JSON as preferences: a field with an unknown value is dropped, other fields pass through. Checked by
 * hand because this runs in the entry chunk of every page, where a schema library would cost more than the page shell.
 */
function toPreferences(value: unknown): Preferences {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const { dateFilter, ...rest } = value as Record<string, Json>;
  return DATE_FILTERS.some((known) => known === dateFilter)
    ? { ...rest, dateFilter: dateFilter as Preferences["dateFilter"] }
    : rest;
}

export function parsePreferencesCookie(cookies = ""): Preferences {
  const cookie = cookies
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${PREFERENCES_COOKIE}=`));
  if (!cookie) return {};
  try {
    const value = decodeURIComponent(cookie.slice(PREFERENCES_COOKIE.length + 1));
    return toPreferences(JSON.parse(value));
  } catch {
    return {};
  }
}

export function savePreferences(updates: Partial<Preferences>) {
  const preferences = toPreferences({ ...parsePreferencesCookie(document.cookie), ...updates });
  const value = encodeURIComponent(JSON.stringify(preferences));
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${PREFERENCES_COOKIE}=${value}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
}
