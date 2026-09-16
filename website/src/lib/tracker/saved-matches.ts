export const savedMatchesKey = (accountId: number) => `tracker:saved-matches:${accountId}`;

/** Ignore damaged storage and invalid IDs while retaining the most recently saved ordering. */
export function parseSavedMatches(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const values: unknown = JSON.parse(raw);
    if (!Array.isArray(values)) return [];
    return [...new Set(values.filter((value): value is number => Number.isSafeInteger(value) && value > 0))];
  } catch {
    return [];
  }
}
