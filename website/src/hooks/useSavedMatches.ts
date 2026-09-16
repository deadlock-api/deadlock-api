import { useCallback, useMemo, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { readLocalStorage, writeLocalStorage } from "~/lib/local-storage";
import { parseSavedMatches, savedMatchesKey } from "~/lib/tracker/saved-matches";

const UPDATED_EVENT = "tracker-saved-matches-updated";
const serverSnapshot = () => null;

/** Account-scoped saves stay synchronized between the match header, saved list and other tabs. */
export function useSavedMatches(accountId: number) {
  const key = savedMatchesKey(accountId);
  const subscribe = useCallback(
    (listener: () => void) => {
      const onStorage = (event: StorageEvent) => {
        if (event.key === null || event.key === key) listener();
      };
      const onUpdate = (event: Event) => {
        if ((event as CustomEvent<string>).detail === key) listener();
      };
      window.addEventListener("storage", onStorage);
      window.addEventListener(UPDATED_EVENT, onUpdate);
      return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(UPDATED_EVENT, onUpdate);
      };
    },
    [key],
  );
  const getSnapshot = useCallback(() => readLocalStorage(key), [key]);
  const raw = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
  const savedIds = useMemo(() => parseSavedMatches(raw), [raw]);
  const toggleSaved = (matchId: number) => {
    const current = parseSavedMatches(readLocalStorage(key));
    const next = current.includes(matchId) ? current.filter((id) => id !== matchId) : [matchId, ...current];
    if (!writeLocalStorage(key, JSON.stringify(next))) {
      toast.error("Could not update saved matches. Browser storage is unavailable or full.");
      return false;
    }
    window.dispatchEvent(new CustomEvent(UPDATED_EVENT, { detail: key }));
    return true;
  };
  return { savedIds, toggleSaved };
}
