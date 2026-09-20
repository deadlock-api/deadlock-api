import { Children, Fragment } from "react";

import { cn } from "~/lib/utils";

/**
 * A line of facts about one thing, divided by bars: date, author, reading time. Built from spans, so it is valid
 * inside a paragraph such as a PageHeader description.
 */
export function MetaList({
  size = "default",
  className,
  children,
  ...props
}: React.ComponentProps<"span"> & { size?: "sm" | "default" }) {
  const items = Children.toArray(children);
  return (
    <span
      data-slot="meta-list"
      data-size={size}
      className={cn(
        "flex min-w-0 flex-wrap items-center text-muted-foreground",
        size === "sm" ? "gap-x-2 gap-y-0.5 text-2xs" : "gap-x-3 gap-y-1 text-xs",
        className,
      )}
      {...props}
    >
      {items.map((item, i) => (
        // oxlint-disable-next-line react/no-array-index-key -- the items are static children without ids
        <Fragment key={i}>
          {i > 0 && (
            <span aria-hidden="true" data-slot="meta-list-separator" className="text-border select-none">
              |
            </span>
          )}
          {item}
        </Fragment>
      ))}
    </span>
  );
}

/** One fact, with an optional leading icon. */
export function MetaItem({
  icon,
  className,
  children,
  ...props
}: React.ComponentProps<"span"> & { icon?: React.ReactNode }) {
  return (
    <span
      data-slot="meta-item"
      className={cn("inline-flex min-w-0 items-center gap-1.5 [&_svg]:size-3.5 [&_svg]:shrink-0", className)}
      {...props}
    >
      {icon}
      {children}
    </span>
  );
}
