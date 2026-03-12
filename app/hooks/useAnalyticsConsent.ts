import { usePostHog } from "@posthog/react";
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "analytics-consent";

type ConsentValue = "granted" | "denied" | null;
type ConsentState = ConsentValue | "unknown";

function readConsent(): ConsentValue {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY) as ConsentValue;
}

export function useAnalyticsConsent() {
  const posthog = usePostHog();
  const [consent, setConsent] = useState<ConsentState>("unknown");

  useEffect(() => {
    setConsent(readConsent());
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setConsent(readConsent());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const accept = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "granted");
    posthog.set_config({ persistence: "localStorage+cookie" });
    posthog.opt_in_capturing();
    setConsent("granted");
  }, [posthog]);

  const decline = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "denied");
    posthog.opt_out_capturing();
    posthog.clear_opt_in_out_capturing();
    setConsent("denied");
  }, [posthog]);

  const reset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    posthog.opt_out_capturing();
    posthog.clear_opt_in_out_capturing();
    setConsent(null);
  }, [posthog]);

  return { consent, accept, decline, reset };
}
