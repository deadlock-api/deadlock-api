import { CircleAlert, RefreshCw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

/** A recoverable request failure, kept separate from a successful response with no data. */
export function TrackerQueryError({
  title,
  description,
  onRetry,
  isRetrying,
}: {
  title: string;
  description: string;
  onRetry: () => void;
  isRetrying: boolean;
}) {
  return (
    <Alert>
      <CircleAlert aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{description}</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry} disabled={isRetrying}>
          <RefreshCw data-icon="inline-start" className={cn(isRetrying && "animate-spin")} />
          {isRetrying ? "Retrying…" : "Try again"}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
