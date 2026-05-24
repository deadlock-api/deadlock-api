import type { UseQueryResult } from "@tanstack/react-query";

import { LoadingLogo } from "~/components/LoadingLogo";

interface QueryRendererProps<T> {
  query: UseQueryResult<T>;
  loadingFallback?: React.ReactNode;
  errorFallback?: (error: Error) => React.ReactNode;
  children: (data: T) => React.ReactNode;
}

const DEFAULT_LOADING_FALLBACK = <LoadingLogo />;
const defaultErrorFallback = (error: Error) => (
  <div className="py-8 text-center text-sm text-destructive">Error: {error.message}</div>
);

export function QueryRenderer<T>({
  query,
  loadingFallback = DEFAULT_LOADING_FALLBACK,
  errorFallback = defaultErrorFallback,
  children,
}: QueryRendererProps<T>) {
  if (query.isPending) return loadingFallback;
  if (query.isError) return errorFallback(query.error);
  if (query.data == null) return null;
  return children(query.data);
}

export function combineQueryStates(...queries: UseQueryResult<unknown>[]) {
  return {
    isPending: queries.some((q) => q.isPending),
    isError: queries.some((q) => q.isError),
    error: queries.find((q) => q.error)?.error,
  };
}
