import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

import { NotFound } from "./components/NotFound";
import { isChunkLoadError, reloadOnceForStaleChunk } from "./lib/chunk-reload";
import { routeTree } from "./routeTree.gen";

export interface RouterContext {
  queryClient: QueryClient;
}

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: 3,
      },
    },
  });

  const router = createRouter({
    routeTree,
    defaultPreload: false,
    defaultErrorComponent: (err) => {
      if (isChunkLoadError(err.error) && reloadOnceForStaleChunk()) {
        return null;
      }
      return <p>{err.error.stack}</p>;
    },
    defaultOnCatch: (error) => {
      if (isChunkLoadError(error)) {
        reloadOnceForStaleChunk();
      }
    },
    defaultNotFoundComponent: NotFound,
    scrollRestoration: true,
    context: { queryClient } satisfies RouterContext,
  });

  setupRouterSsrQueryIntegration({ router, queryClient });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
