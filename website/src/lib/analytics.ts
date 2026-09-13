import type { PostHog } from "posthog-js";

const token = import.meta.env.VITE_PUBLIC_POSTHOG_TOKEN as string | undefined;

let client: Promise<PostHog | null> | undefined;

export function getAnalytics(): Promise<PostHog | null> {
  client ??= (async () => {
    if (!import.meta.env.PROD || !token) return null;
    const { default: posthog } = await import("posthog-js");
    posthog.init(token, {
      api_host: "https://e.deadlock-api.com",
      ui_host: "https://eu.posthog.com",
      defaults: "2026-08-30",
      cookieless_mode: "always",
    });
    return posthog;
  })();
  return client;
}
