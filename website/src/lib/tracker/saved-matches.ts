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

/** Undo one removal while retaining bookmarks added or removed since that action. */
export function restoreSavedMatch(current: number[], beforeRemoval: number[], matchId: number): number[] {
  const previousIndex = beforeRemoval.indexOf(matchId);
  const remaining = new Set(current);
  if (previousIndex < 0 || remaining.has(matchId)) return current;
  const nextId = beforeRemoval.slice(previousIndex + 1).find((id) => remaining.has(id));
  const index = nextId === undefined ? current.length : current.indexOf(nextId);
  return [...current.slice(0, index), matchId, ...current.slice(index)];
}
