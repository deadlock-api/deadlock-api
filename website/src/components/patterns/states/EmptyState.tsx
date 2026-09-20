import type { LucideIcon } from "lucide-react";

import { cn } from "~/lib/utils";

interface EmptyStateProps extends Omit<React.ComponentProps<"div">, "title" | "children"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: LucideIcon;
  /** What the reader can do about it: a reset button, a link. */
  action?: React.ReactNode;
  /**
   * `panel` is a bordered block that stands in for the missing content, `plain` is the same without the border for
   * use inside a Card or Panel, `inline` is a single quiet line.
   */
  variant?: "panel" | "plain" | "inline";
}

/** A query that succeeded with nothing to show. A query that failed is an ErrorState, never this. */
export function EmptyState({
  title,
  description,
  icon: Icon,
  action,
  variant = "panel",
  className,
  ...props
}: EmptyStateProps) {
  if (variant === "inline") {
    return (
      <div
        data-slot="empty-state"
        data-variant="inline"
        aria-live="polite"
        className={cn("py-8 text-center text-sm text-balance text-muted-foreground", className)}
        {...props}
      >
        <p>{title}</p>
        {description && <p className="text-xs">{description}</p>}
      </div>
    );
  }
  return (
    <div
      data-slot="empty"
      data-size="default"
      data-empty-state
      data-variant={variant}
      aria-live="polite"
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center justify-center gap-6 rounded-lg p-6 text-center text-balance",
        variant === "panel" && "border",
        className,
      )}
      {...props}
    >
      <div data-slot="empty-header" className="flex max-w-sm flex-col items-center gap-2 text-center">
        {Icon && (
          <div
            data-slot="empty-icon"
            className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-6"
          >
            <Icon aria-hidden="true" />
          </div>
        )}
        <div data-slot="empty-title" className="text-lg font-medium tracking-tight break-words">
          {title}
        </div>
        {description && (
          <p
            data-slot="empty-description"
            className="text-sm/relaxed text-muted-foreground [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary"
          >
            {description}
          </p>
        )}
      </div>
      {action && (
        <div
          data-slot="empty-content"
          className="flex w-full max-w-sm min-w-0 flex-col items-center gap-4 text-sm text-balance"
        >
          {action}
        </div>
      )}
    </div>
  );
}
