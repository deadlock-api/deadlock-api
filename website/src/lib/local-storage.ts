/** Optional preferences must not prevent the page from working when browser storage is unavailable. */
export function readLocalStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Returns whether the value was persisted, so saved-data controls can report a failed write. */
export function writeLocalStorage(key: string, value: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    // Storage may be disabled or full. The in-memory UI state remains usable.
    return false;
  }
}
