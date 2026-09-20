import { type ChartSize, chartSizeVariants } from "~/components/patterns/charts/ChartSurface";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { cn } from "~/lib/utils";

/** Plots this short have no room for a block with a title and a description; they get the one-line state. */
const isStrip = (size?: ChartSize) => size === "xs" || size === "sm";

/** The plot heights step with their container, so every state is its own container, as `ChartSurface` is. */
const stateRoot = "@container min-w-0";

interface ChartStateProps extends Omit<React.ComponentProps<"div">, "children"> {
  /** What the chart shows, in lower case: "win rate by rank". */
  label: string;
  /** The plot's `size`, so the state takes the plot's height and the layout does not jump. */
  size?: ChartSize;
}

export function ChartLoading({ label, size = "default", className, ...props }: ChartStateProps) {
  return (
    <div data-slot="chart-loading" className={cn(stateRoot, size === "fill" && "h-full", className)} {...props}>
      <LoadingState variant="skeleton" label={label} className={chartSizeVariants({ size })} />
    </div>
  );
}

interface ChartErrorProps extends ChartStateProps {
  onRetry?: () => void;
  retrying?: boolean;
}

export function ChartError({ label, onRetry, retrying = false, size, className, ...props }: ChartErrorProps) {
  return (
    <div data-slot="chart-error" className={cn(stateRoot, size === "fill" && "h-full", className)} {...props}>
      <div className={cn(size && chartSizeVariants({ size }), "flex min-w-0 flex-col justify-center")}>
        <ErrorState
          variant={isStrip(size) ? "inline" : "alert"}
          title={`Unable to load ${label}`}
          description="Your filters are still selected. Try loading the chart again."
          onRetry={onRetry}
          retrying={retrying}
        />
      </div>
    </div>
  );
}

export function ChartEmpty({ label, size, className, ...props }: ChartStateProps) {
  return (
    <div data-slot="chart-empty" className={cn(stateRoot, size === "fill" && "h-full", className)} {...props}>
      {isStrip(size) ? (
        <EmptyState
          variant="inline"
          title={`No ${label} for these filters`}
          className={cn(chartSizeVariants({ size }), "flex items-center justify-center py-0")}
        />
      ) : (
        <EmptyState
          title={`No ${label} for these filters`}
          description="Try a wider date range or fewer filters."
          className={size ? cn(chartSizeVariants({ size }), "flex-none") : undefined}
        />
      )}
    </div>
  );
}
