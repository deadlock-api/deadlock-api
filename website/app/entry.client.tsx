import { startTransition, type ReactNode, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

/**
 * Dynamically initialize PostHog only in production with a valid token.
 * Uses cookieless tracking so no consent banner is needed.
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

  posthogClient.init(import.meta.env.VITE_PUBLIC_POSTHOG_TOKEN, {
    api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
    defaults: "2026-01-30",
    __add_tracing_headers: [window.location.host, "localhost"],
    cookieless_mode: "always",
  });

  // Test if PostHog is reachable (ad blockers often block it). If not, disable it entirely.
  const apiHost = import.meta.env.VITE_PUBLIC_POSTHOG_HOST;
  if (apiHost) {
    fetch(`${apiHost}/decide/?v=3`, { method: "POST", body: "{}" }).catch(() => {
      posthogClient.opt_out_capturing();
    });
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
