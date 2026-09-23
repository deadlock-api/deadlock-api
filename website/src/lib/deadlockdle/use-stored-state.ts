import { useCallback, useState } from "react";

import { useHydrated } from "~/hooks/useHydrated";
import { readLocalStorage, writeLocalStorage } from "~/lib/local-storage";

/** A stored JSON value, or `fallback` when storage is unavailable, empty or holds something unparsable */
export function readStoredJson<T>(key: string, fallback: T): T {
  const raw = readLocalStorage(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeStoredJson(key: string, value: unknown): void {
  writeLocalStorage(key, JSON.stringify(value));
}

interface StoredStateOptions<T> {
  /** Reloads from storage when it changes, e.g. the puzzle date. */
  scope?: string;
  /** Whether a saved value still applies; a rejected one is replaced by `fresh()`. */
  accept?: (saved: T) => boolean;
  /** Read when `key` holds nothing: where the value was stored before. Saving always writes `key`. */
  fallbackKey?: string;
}

/**
 * State persisted under `key`. The server render and hydration use `fresh()`, since storage only exists in the
 * browser; the saved value loads on the render after, and again whenever `key` or `scope` changes. `save` updates the
 * state and persists it.
 */
export function useStoredState<T>(
  key: string,
  fresh: () => T,
  { scope = "", accept, fallbackKey }: StoredStateOptions<T> = {},
) {
  const hydrated = useHydrated();
  const source = hydrated ? `${key}@${scope}` : `ssr@${scope}`;
  const [state, setState] = useState<T>(fresh);
  const [loadedFrom, setLoadedFrom] = useState<string | null>(null);

  if (loadedFrom !== source) {
    setLoadedFrom(source);
    const saved = hydrated
      ? (readStoredJson<T | null>(key, null) ?? (fallbackKey ? readStoredJson<T | null>(fallbackKey, null) : null))
      : null;
    setState(saved != null && (accept?.(saved) ?? true) ? saved : fresh());
  }

  const save = useCallback(
    (next: T) => {
      setState(next);
      writeStoredJson(key, next);
    },
    [key],
  );

  return [state, save] as const;
}

/**
 * One puzzle day's saved progress, which starts over when `date` moves on while the page stays open (midnight UTC).
 * `fallbackKey` is where the day may have been saved before (see `legacyGameStorageKey`).
 */
export function useStoredDailyState<T extends { date: string }>(
  key: string,
  date: string,
  fresh: (date: string) => T,
  fallbackKey?: string,
) {
  return useStoredState(key, () => fresh(date), { scope: date, accept: (saved) => saved.date === date, fallbackKey });
}
