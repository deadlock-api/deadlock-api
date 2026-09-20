import type { UseQueryResult } from "@tanstack/react-query";

import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";

interface QueryRendererProps<T> {
  query: UseQueryResult<T>;
  loadingFallback?: React.ReactNode;
  errorFallback?: (error: Error) => React.ReactNode;
  /** Keep successful data visible after a failed refresh; the caller displays the refresh status. */
  keepDataOnError?: boolean;
  children: (data: T) => React.ReactNode;
}

const DEFAULT_LOADING_FALLBACK = <LoadingState />;

// Law 6 does not apply: this renders its children's tree, not a root element of its own.
export function QueryRenderer<T>({
  query,
  loadingFallback = DEFAULT_LOADING_FALLBACK,
  errorFallback,
  keepDataOnError = false,
  children,
}: QueryRendererProps<T>) {
  if (query.isPending) return loadingFallback;
  if (query.isError && !(keepDataOnError && query.data != null)) {
    if (errorFallback) return errorFallback(query.error);
    return (
      <ErrorState description={query.error.message} onRetry={() => void query.refetch()} retrying={query.isFetching} />
    );
  }
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
