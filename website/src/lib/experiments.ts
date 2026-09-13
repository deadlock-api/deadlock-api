import { useEffect, useState } from "react";

import { getAnalytics } from "~/lib/analytics";

/**
 * Variant of a PostHog multivariate flag, "control" until flags load (and forever on SSR, in dev, or without analytics).
 * Cookieless mode hashes IP + user agent per day, so a returning visitor may switch variants across days.
 */
export function useExperiment(flagKey: string): string {
  const [variant, setVariant] = useState("control");
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void (async () => {
      const posthog = await getAnalytics();
      if (!posthog || !active) return;
      unsubscribe = posthog.onFeatureFlags(() => {
        const value = posthog.getFeatureFlag(flagKey);
        if (active && typeof value === "string") setVariant(value);
      });
    })();
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [flagKey]);
  return variant;
}
