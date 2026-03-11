/**
 * By default, Remix will handle hydrating your app on the client for you.
 * You are free to delete this file if you'd like to, but if you ever want it revealed again, you can run `npx remix reveal` ✨
 * For more information, see https://remix.run/file-conventions/entry.client
 */

import { PostHogProvider } from "@posthog/react";
import posthogClient from "posthog-js";
import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

if (import.meta.env.PROD) {
  const consentGiven = localStorage.getItem("analytics-consent") === "granted";

  posthogClient.init(import.meta.env.VITE_PUBLIC_POSTHOG_TOKEN, {
    api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
    defaults: "2026-01-30",
    __add_tracing_headers: [window.location.host, "localhost"],
    opt_out_capturing_by_default: true,
    persistence: consentGiven ? "localStorage+cookie" : "memory",
  });

  if (consentGiven) {
    posthogClient.opt_in_capturing();
  }
}

startTransition(() => {
  hydrateRoot(
    document,
    <PostHogProvider client={posthogClient}>
      <StrictMode>
        <HydratedRouter />
      </StrictMode>
    </PostHogProvider>,
  );
});
