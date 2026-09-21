import type { PostHog } from "posthog-js";

// The project token is public by design (it ships in every visitor's bundle); the env var only overrides it.
const token =
  (import.meta.env.VITE_PUBLIC_POSTHOG_TOKEN as string | undefined) ||
  "phc_HdWYYwTIliAFysphiOtKQ8dSRjgte2jVfS4ADg2bJD1";

let client: Promise<PostHog | null> | undefined;

export function getAnalytics(): Promise<PostHog | null> {
  client ??= (async () => {
    if (!import.meta.env.PROD) return null;
    const { default: posthog } = await import("posthog-js");
    posthog.init(token, {
      api_host: "https://e.deadlock-api.com",
      ui_host: "https://eu.posthog.com",
      defaults: "2026-08-30",
      cookieless_mode: "always",
      capture_dead_clicks: {
        // Radix tabs switch on mousedown; the detector only counts DOM changes after the click, so every tab
        // switch reads as dead. A custom list replaces the defaults, hence the two `ph-no-*` entries.
        css_selector_ignorelist: [".ph-no-deadclick", ".ph-no-capture", '[role="tab"]'],
      },
    });
    return posthog;
  })();
  return client;
}
