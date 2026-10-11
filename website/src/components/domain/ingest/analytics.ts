import { useEffect, useRef } from "react";

import { getAnalytics } from "~/lib/analytics";

// The ingest tool's install call to action, tracked in PostHog (production only, cookieless) so its click rate can be
// compared across placements: `ingest_install_cta_viewed` once per mount when half the button is on screen, and
// `ingest_install_cta_clicked` on every click. Click rate = clicked / viewed, split by `placement` and `action`.

/** Where the button sits; one value per call site, so placements can be compared. */
export type InstallCtaPlacement =
  | "ingest_header"
  | "ingest_guide"
  | "home"
  | "tracker_gate"
  | "tracker_demo"
  | "match_not_stored"
  | "design_system";

/** What a click does: download the Windows installer, or lead to the install steps (every other platform). */
export type InstallCtaAction = "download" | "install_steps";

function track(name: "viewed" | "clicked", placement: InstallCtaPlacement, action: InstallCtaAction) {
  void getAnalytics().then((posthog) => posthog?.capture(`ingest_install_cta_${name}`, { placement, action }));
}

/** Tracks views and clicks of one install button; put the ref and `onClick` on its anchor. */
export function useInstallCtaTracking(placement: InstallCtaPlacement, action: InstallCtaAction) {
  const ref = useRef<HTMLAnchorElement>(null);

  // Re-armed when the action changes: it flips from `install_steps` to `download` after hydration on Windows.
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        track("viewed", placement, action);
      },
      { threshold: 0.5 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [placement, action]);

  return { ref, onClick: () => track("clicked", placement, action) };
}
