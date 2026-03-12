import { usePostHog } from "@posthog/react";
import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "analytics-consent";

type ConsentValue = "granted" | "denied" | null;

const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) listener();
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) callback();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): ConsentValue {
  return localStorage.getItem(STORAGE_KEY) as ConsentValue;
}

function getServerSnapshot(): ConsentValue {
  return "unknown" as unknown as ConsentValue;
}

export function useAnalyticsConsent() {
  const posthog = usePostHog();
  const consent = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const accept = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "granted");
    posthog.set_config({ persistence: "localStorage+cookie" });
    posthog.opt_in_capturing();
    emitChange();
  }, [posthog]);

  const decline = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "denied");
    posthog.opt_out_capturing();
    posthog.clear_opt_in_out_capturing();
    emitChange();
  }, [posthog]);

  const reset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    posthog.opt_out_capturing();
    posthog.clear_opt_in_out_capturing();
    emitChange();
  }, [posthog]);

  return { consent, accept, decline, reset };
}
