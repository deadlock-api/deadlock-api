import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

interface ErrorStateProps extends Omit<React.ComponentProps<"div">, "title" | "children"> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** A failed request must offer a way forward. Omit only when nothing can be retried, such as invalid input. */
  onRetry?: () => void;
  retrying?: boolean;
  /** `alert` is the full block; `inline` is one line with a retry link, for half-width panels and table cells. */
  variant?: "alert" | "inline";
}

/** A failed request. It keeps the reader's filters and offers a retry, so it never reads as an empty result. */
export function ErrorState({
  title = "Something went wrong",
  description = "Your filters are still selected. Try loading this again.",
  onRetry,
  retrying = false,
  variant = "alert",
  className,
  ...props
}: ErrorStateProps) {
  if (variant === "inline") {
    return (
      <div
        data-slot="error-state"
        data-variant="inline"
        role="alert"
        className={cn("py-4 text-center text-xs text-muted-foreground", className)}
        {...props}
      >
        <span className="text-destructive">{title}.</span>{" "}
        {onRetry && (
          <Button variant="link" className="h-auto p-0 text-xs" disabled={retrying} onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    );
  }
  return (
    <Alert data-error-state variant="destructive" className={className} {...props}>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{description}</p>
        {onRetry && (
          <Button variant="outline" size="sm" disabled={retrying} onClick={onRetry}>
            Try again
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
