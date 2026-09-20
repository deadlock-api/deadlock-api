import type { LucideIcon } from "lucide-react";

import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "~/components/ui/empty";
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
    <Empty
      data-empty-state
      data-variant={variant}
      aria-live="polite"
      className={cn("p-6", variant === "panel" && "border", className)}
      {...props}
    >
      <EmptyHeader>
        {Icon && (
          <EmptyMedia variant="icon">
            <Icon aria-hidden="true" />
          </EmptyMedia>
        )}
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}
