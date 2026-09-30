import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

import { NotFound } from "./components/app/NotFound";
import { RouteError } from "./components/app/RouteError";
import { isChunkLoadError, reloadOnceForStaleChunk } from "./lib/chunk-reload";
import { isClientError } from "./lib/http";
import type { Preferences } from "./lib/preferences";
import { parseSearch, stringifySearch } from "./lib/search-params";
import { routeTree } from "./routeTree.gen";

export interface RouterContext {
  queryClient: QueryClient;
  preferences: Preferences;
}

function afterNextPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => failureCount < 3 && !isClientError(error),
      },
    },
  });

  const router = createRouter({
    routeTree,
    defaultPreload: false,
    defaultErrorComponent: ({ error, reset }) => {
      if (isChunkLoadError(error) && reloadOnceForStaleChunk()) {
        return null;
      }
      return <RouteError error={error} reset={reset} />;
    },
    defaultOnCatch: (error) => {
      if (isChunkLoadError(error)) {
        reloadOnceForStaleChunk();
      }
    },
    defaultNotFoundComponent: () => <NotFound />,
    scrollRestoration: true,
    parseSearch,
    stringifySearch,
    context: { queryClient, preferences: {} } satisfies RouterContext,
  });

  setupRouterSsrQueryIntegration({ router, queryClient });

  // A `preload="intent"` link preloads synchronously in touchstart, which runs before the tap's first paint: route
  // matching, loaders and the chunk import held that paint back 40-80 ms on a throttled phone. Starting the preload
  // after the next paint lets the tap show first; it still starts well before the click that follows.
  if (typeof window !== "undefined") {
    const preloadRoute = router.preloadRoute;
    router.preloadRoute = (options) => afterNextPaint().then(() => preloadRoute(options));
  }

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
