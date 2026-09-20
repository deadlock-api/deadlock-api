import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import type { AxiosError } from "axios";

import { NotFound } from "./components/app/NotFound";
import { RouteError } from "./components/app/RouteError";
import { isChunkLoadError, reloadOnceForStaleChunk } from "./lib/chunk-reload";
import { ApiError } from "./lib/http";
import type { Preferences } from "./lib/preferences";
import { routeTree } from "./routeTree.gen";

export interface RouterContext {
  queryClient: QueryClient;
  preferences: Preferences;
}

function isClientError(error: unknown): boolean {
  // Axios's public error marker lets the router classify retries without
  // loading the HTTP client on pages that make no API requests.
  const isAxiosError =
    typeof error === "object" && error !== null && "isAxiosError" in error && error.isAxiosError === true;
  const status = isAxiosError
    ? (error as AxiosError).response?.status
    : error instanceof ApiError
      ? error.status
      : undefined;
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
    defaultNotFoundComponent: () => <NotFound />,
    scrollRestoration: true,
    context: { queryClient, preferences: {} } satisfies RouterContext,
  });

  setupRouterSsrQueryIntegration({ router, queryClient });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
