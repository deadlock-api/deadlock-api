import { z } from "zod";

export const PREFERENCES_COOKIE = "preferences";

// Fields are optional; unknown fields survive updates from older clients.
export const preferencesSchema = z
  .object({
    dateFilter: z.enum(["season", "patch"]).optional().catch(undefined),
  })
  .catchall(z.json());

export type Preferences = z.infer<typeof preferencesSchema>;

export function parsePreferencesCookie(cookies = ""): Preferences {
  const cookie = cookies
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${PREFERENCES_COOKIE}=`));
  if (!cookie) return {};
  try {
    const value = decodeURIComponent(cookie.slice(PREFERENCES_COOKIE.length + 1));
    return preferencesSchema.parse(JSON.parse(value));
  } catch {
    return {};
  }
}

export function savePreferences(updates: Partial<Preferences>) {
  const preferences = preferencesSchema.parse({ ...parsePreferencesCookie(document.cookie), ...updates });
  const value = encodeURIComponent(JSON.stringify(preferences));
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${PREFERENCES_COOKIE}=${value}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
}
