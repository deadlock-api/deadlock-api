import { chartFrameHeight, type ChartSize, chartSizeVariants } from "~/components/patterns/charts/ChartSurface";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { cn } from "~/lib/utils";

/** The plot heights step with their container, so every state is its own container, as `ChartSurface` is. */
const stateRoot = "@container min-w-0";

interface ChartStateProps extends Omit<React.ComponentProps<"div">, "children"> {
  /** What the chart shows, in lower case: "win rate by rank". */
  label: string;
}

interface ChartLoadingProps extends ChartStateProps {
  /** The plot's `size`, so the state takes the plot's height and the layout does not jump. */
  size?: ChartSize;
}

export function ChartLoading({ label, size = "default", className, ...props }: ChartLoadingProps) {
  return (
    <div data-slot="chart-loading" className={cn(stateRoot, chartFrameHeight(size), className)} {...props}>
      <LoadingState variant="skeleton" label={label} className={chartSizeVariants({ size })} />
    </div>
  );
}

interface ChartErrorProps extends ChartStateProps {
  onRetry?: () => void;
  retrying?: boolean;
}

export function ChartError({ label, onRetry, retrying = false, className, ...props }: ChartErrorProps) {
  return (
    <div data-slot="chart-error" className={cn(stateRoot, className)} {...props}>
      <div className="flex min-w-0 flex-col justify-center">
        <ErrorState
          variant="alert"
          title={`Unable to load ${label}`}
          description="Your filters are still selected. Try loading the chart again."
          onRetry={onRetry}
          retrying={retrying}
        />
      </div>
    </div>
  );
}

interface ChartEmptyProps extends ChartStateProps {
  /** Why there is nothing, or what to try. Say so when the data only begins at some date. */
  description?: React.ReactNode;
}

export function ChartEmpty({
  label,
  description = "Try a wider date range or fewer filters.",
  className,
  ...props
}: ChartEmptyProps) {
  return (
    <div data-slot="chart-empty" className={cn(stateRoot, className)} {...props}>
      <EmptyState title={`No ${label} for these filters`} description={description} />
    </div>
  );
}
