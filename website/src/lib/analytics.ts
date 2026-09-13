const token = import.meta.env.VITE_PUBLIC_POSTHOG_TOKEN as string | undefined;

export async function initAnalytics() {
  if (!import.meta.env.PROD || !token) return;
  const { default: posthog } = await import("posthog-js");
  posthog.init(token, {
    api_host: "https://e.deadlock-api.com",
    ui_host: "https://eu.posthog.com",
    defaults: "2026-08-30",
    cookieless_mode: "always",
  });
}
