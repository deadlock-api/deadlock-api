import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "~/components/ui/empty";
import { Skeleton } from "~/components/ui/skeleton";

export function ChartLoading({ label }: { label: string }) {
  return (
    <div className="relative">
      <output className="sr-only">Loading {label}</output>
      <Skeleton className="h-[280px] w-full rounded-xl sm:h-[320px]" />
    </div>
  );
}

export function ChartError({ label, onRetry, retrying }: { label: string; onRetry: () => void; retrying: boolean }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Unable to load {label}</AlertTitle>
      <AlertDescription>
        <p>Your filters are still selected. Try loading the chart again.</p>
        <Button variant="outline" size="sm" disabled={retrying} onClick={onRetry}>
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export function ChartEmpty({ label }: { label: string }) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyTitle>No {label} for these filters</EmptyTitle>
        <EmptyDescription>Try a wider date range or fewer filters.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
