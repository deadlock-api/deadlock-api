import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { isAxiosError } from "axios";

import { NotFound } from "./components/NotFound";
import { RouteError } from "./components/RouteError";
import { isChunkLoadError, reloadOnceForStaleChunk } from "./lib/chunk-reload";
import { ApiError } from "./lib/http";
import { routeTree } from "./routeTree.gen";

export interface RouterContext {
  queryClient: QueryClient;
}

function isClientError(error: unknown): boolean {
  const status = isAxiosError(error) ? error.response?.status : error instanceof ApiError ? error.status : undefined;
  return status !== undefined && status >= 400 && status < 500;
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
