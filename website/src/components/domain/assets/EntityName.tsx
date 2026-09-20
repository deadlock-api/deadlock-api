import { Slot } from "radix-ui";
import { cloneElement } from "react";

import { FOCUS_RING } from "~/components/ui/recipes";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";

// No `ref`: the root is an anchor when linked and a span otherwise, so no single element type would be true.
export type EntityNameProps = Omit<React.ComponentPropsWithoutRef<"span">, "children"> & {
  name: string;
  loading?: boolean;
  /** The router `Link` to the entity's page, without children. Leave out for plain text. */
  link?: React.ReactElement;
  /** `sm` and `default` are the widths of the loading placeholder. */
  size?: "sm" | "default";
};

/** The name of a hero, item or ability: one truncating line, a link when `link` is given. */
export function EntityName({ name, loading = false, link, size = "sm", className, ...props }: EntityNameProps) {
  if (loading) {
    return <Skeleton className={cn("inline-block h-4", size === "sm" ? "w-20" : "w-24", className)} />;
  }
  if (link) {
    return (
      <Slot.Root
        data-slot="entity-name"
        title={name}
        className={cn(FOCUS_RING, "truncate rounded-sm hover:underline", className)}
        {...props}
        // Rows that hold this name are often clickable themselves (expand, select); the link must not trigger them.
        onClick={(event: React.MouseEvent<HTMLSpanElement>) => {
          event.stopPropagation();
          props.onClick?.(event);
        }}
      >
        {cloneElement(link, undefined, name)}
      </Slot.Root>
    );
  }
  return (
    <span data-slot="entity-name" title={name} className={cn("truncate", className)} {...props}>
      {name}
    </span>
  );
}
