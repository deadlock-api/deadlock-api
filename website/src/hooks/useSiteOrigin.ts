import { useSyncExternalStore } from "react";

import { SITE_URL } from "~/lib/seo";

const subscribe = () => () => {};

/**
 * The origin the page is served from (`http://localhost:3000` in dev), for links that must come back here. The server
 * render and hydration use the production origin, so the markup matches; the client then switches to its own.
 */
export function useSiteOrigin(): string {
  return useSyncExternalStore(
    subscribe,
    () => window.location.origin,
    () => SITE_URL,
  );
}
