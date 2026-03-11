import posthog from "posthog-js";
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "analytics-consent";

type ConsentValue = "granted" | "denied" | null;

function readConsent(): ConsentValue {
  return localStorage.getItem(STORAGE_KEY) as ConsentValue;
}

export function useAnalyticsConsent() {
  const [consent, setConsent] = useState<ConsentValue>(() => readConsent());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setConsent(readConsent());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const accept = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "granted");
    posthog.opt_in_capturing();
    posthog.set_config({ persistence: "localStorage+cookie" });
    setConsent("granted");
  }, []);

  const decline = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "denied");
    posthog.opt_out_capturing();
    posthog.clear_opt_in_out_capturing();
    setConsent("denied");
  }, []);

  const reset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    posthog.opt_out_capturing();
    posthog.clear_opt_in_out_capturing();
    setConsent(null);
  }, []);

  return { consent, accept, decline, reset };
}
