import { Children, Fragment } from "react";

import { cn } from "~/lib/utils";

/**
 * A line of facts about one thing, divided by bars: date, author, reading time. Built from spans, so it is valid
 * inside a paragraph such as a PageHeader description.
 */
export function MetaList({ className, children, ...props }: React.ComponentProps<"span">) {
  const items = Children.toArray(children);
  return (
    <span
      data-slot="meta-list"
      className={cn("flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground", className)}
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
