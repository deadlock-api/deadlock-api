import { Button } from "~/components/ui/button";

export function ApiErrorFallback({ resetErrorBoundary }: { resetErrorBoundary: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 p-8">
      <p className="text-muted-foreground">Failed to load data from the API.</p>
      <Button variant="outline" onClick={resetErrorBoundary}>
        Try again
      </Button>
    </div>
  );
}
