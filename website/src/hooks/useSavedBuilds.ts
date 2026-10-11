import { useCallback, useMemo, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { readLocalStorage, writeLocalStorage } from "~/lib/local-storage";

const KEY = "build-designer-saved-builds";
const UPDATED_EVENT = "build-designer-saved-builds-updated";
// A list, not a library: the oldest saves go once there are more.
const MAX_SAVED = 50;
const serverSnapshot = () => null;

/** A build saved from the Build Designer: its hero and the `build_path` / `build_sell` entries of its URL. */
export interface SavedBuild {
  id: string;
  name: string;
  heroId: number | null;
  path: string[];
  sells: string[];
  /** Unix milliseconds. */
  savedAt: number;
}

function parseSavedBuilds(raw: string | null): SavedBuild[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter(
      (b): b is SavedBuild =>
        typeof b === "object" &&
        b !== null &&
        typeof b.id === "string" &&
        typeof b.name === "string" &&
        Array.isArray(b.path) &&
        Array.isArray(b.sells),
    );
  } catch {
    return [];
  }
}

/** The builds saved in this browser, newest first, kept in step between tabs. */
export function useSavedBuilds() {
  const subscribe = useCallback((listener: () => void) => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === KEY) listener();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(UPDATED_EVENT, listener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(UPDATED_EVENT, listener);
    };
  }, []);
  const getSnapshot = useCallback(() => readLocalStorage(KEY), []);
  const raw = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
  const builds = useMemo(() => parseSavedBuilds(raw), [raw]);

  const write = (next: SavedBuild[]) => {
    if (!writeLocalStorage(KEY, JSON.stringify(next))) {
      toast.error("Could not save the build. Browser storage is unavailable or full.");
      return false;
    }
    window.dispatchEvent(new Event(UPDATED_EVENT));
    return true;
  };
  const save = (build: Omit<SavedBuild, "id" | "savedAt">) => {
    const current = parseSavedBuilds(readLocalStorage(KEY));
    const saved: SavedBuild = { ...build, id: crypto.randomUUID(), savedAt: Date.now() };
    if (write([saved, ...current].slice(0, MAX_SAVED))) toast.success(`Saved "${build.name}"`);
  };
  const remove = (id: string) => {
    const current = parseSavedBuilds(readLocalStorage(KEY));
    const removed = current.find((b) => b.id === id);
    if (!removed || !write(current.filter((b) => b.id !== id))) return;
    toast(`Deleted "${removed.name}"`, {
      duration: 8000,
      action: {
        label: "Undo",
        onClick: () => {
          const latest = parseSavedBuilds(readLocalStorage(KEY));
          if (!latest.some((b) => b.id === removed.id)) write([removed, ...latest]);
        },
      },
    });
  };
  return { builds, save, remove };
}
