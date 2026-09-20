import { LoadingLogo } from "~/components/ui/loading-logo";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";

interface LoadingStateProps extends Omit<React.ComponentProps<"div">, "children"> {
  /** What is loading, for assistive technology: "hero stats". */
  label?: string;
  /** A visible line under the logo, when the wait deserves an explanation: "Loading matches…". */
  text?: React.ReactNode;
  /**
   * - `logo`: the brand loader, with optional text under it.
   * - `skeleton`: a block of the final height, for a chart or a panel, so the layout does not jump.
   */
  variant?: "logo" | "skeleton";
  /** `sm` fits a panel, a popover or a table row; `default` stands in for a page or a tab. */
  size?: "sm" | "default";
  /** `center` fills the parent and sits in its middle, with room above and below: a tab, a panel, a page. */
  align?: "start" | "center";
  /** Sizes the skeleton, or positions the logo. */
  className?: string;
}

/** A region that is loading. A control that is busy uses Spinner instead. */
export function LoadingState({
  label = "content",
  text,
  variant = "logo",
  size,
  align = "start",
  className,
  ...props
}: LoadingStateProps) {
  if (variant === "skeleton") {
    return (
      <div data-slot="loading-state" data-variant="skeleton" className="relative" {...props}>
        <output className="sr-only">Loading {label}</output>
        <Skeleton className={cn("h-40 w-full rounded-xl", className)} />
      </div>
    );
  }
  return (
    <div
      data-slot="loading-state"
      data-variant="logo"
      data-align={align}
      className={cn(
        align === "center" && "flex size-full flex-1 items-center justify-center",
        align === "center" && (size === "sm" ? "py-8" : "py-16"),
        className,
      )}
      {...props}
    >
      {!text && <output className="sr-only">Loading {label}</output>}
      <LoadingLogo size={size} text={text && <output>{text}</output>} />
    </div>
  );
}
