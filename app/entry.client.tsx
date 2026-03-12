/**
 * By default, Remix will handle hydrating your app on the client for you.
 * You are free to delete this file if you'd like to, but if you ever want it revealed again, you can run `npx remix reveal` ✨
 * For more information, see https://remix.run/file-conventions/entry.client
 */

import { startTransition, type ReactNode, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

/**
 * Dynamically initialize PostHog only in production with a valid token.
 * Returns a wrapper component that provides the PostHog context, or a passthrough.
 */
async function createPostHogWrapper(): Promise<React.ComponentType<{ children: ReactNode }>> {
  if (!import.meta.env.PROD || !import.meta.env.VITE_PUBLIC_POSTHOG_TOKEN) {
    if (import.meta.env.PROD) {
      console.warn(
        "[Analytics] PostHog token missing — analytics disabled. Ensure VITE_PUBLIC_POSTHOG_TOKEN is set at build time.",
      );
    }
    return ({ children }) => <>{children}</>;
  }

  const [{ default: posthogClient }, { PostHogProvider }] = await Promise.all([
    import("posthog-js"),
    import("@posthog/react"),
  ]);

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

  return ({ children }) => <PostHogProvider client={posthogClient}>{children}</PostHogProvider>;
}

async function hydrate() {
  const Wrapper = await createPostHogWrapper();
  startTransition(() => {
    hydrateRoot(
      document,
      <Wrapper>
        <StrictMode>
          <HydratedRouter />
        </StrictMode>
      </Wrapper>,
    );
  });
}

void hydrate();
