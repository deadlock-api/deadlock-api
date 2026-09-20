import { ErrorState } from "~/components/patterns/states/ErrorState";

export function ApiErrorFallback({ resetErrorBoundary }: { resetErrorBoundary: () => void }) {
  return <ErrorState title="Failed to load data from the API." onRetry={resetErrorBoundary} />;
}
