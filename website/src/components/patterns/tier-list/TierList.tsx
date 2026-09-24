import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { useId } from "react";

import { FOCUS_RING } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

const tierLabelVariants = cva(
  "flex w-12 shrink-0 flex-col items-center justify-center gap-1 px-1 py-2 text-center text-tier-foreground @md:w-20",
  {
    variants: {
      /** The grade. Its letter is printed on the fill, so the hue is never the only signal. */
      tier: { s: "bg-tier-s", a: "bg-tier-a", b: "bg-tier-b", c: "bg-tier-c", d: "bg-tier-d" },
    },
    defaultVariants: { tier: "b" },
  },
);

export type TierGrade = NonNullable<VariantProps<typeof tierLabelVariants>["tier"]>;

/**
 * A ranked list of grades, best first: each `TierRow` is a letter on its tier color and the entries that earned it.
 * The rows are an ordered list, the entries of a row a list named after its grade ("S tier").
 */
export function TierList({ className, ...props }: React.ComponentProps<"ol">) {
  return <ol data-slot="tier-list" className={cn("@container flex list-none flex-col gap-2", className)} {...props} />;
}

/**
 * One grade: the letter (`label`, the grade's own letter by default), an optional short `description` under it, and
 * `TierItem` children that wrap onto as many lines as the width needs.
 */
export function TierRow({
  tier = "b",
  label,
  description,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"li">, "title"> & {
  tier?: TierGrade;
  label?: React.ReactNode;
  description?: React.ReactNode;
}) {
  const labelId = useId();
  return (
    <li
      data-slot="tier-row"
      data-tier={tier}
      className={cn("flex min-w-0 overflow-hidden rounded-xl border bg-card", className)}
      {...props}
    >
      <div id={labelId} data-slot="tier-row-label" className={tierLabelVariants({ tier })}>
        <span className="text-2xl leading-none font-bold @md:text-4xl">{label ?? tier.toUpperCase()}</span>
        <span className="sr-only"> tier</span>
        {description && (
          <span className="text-3xs leading-tight font-semibold tracking-wide uppercase @md:text-2xs">
            {description}
          </span>
        )}
      </div>
      <ul
        aria-labelledby={labelId}
        data-slot="tier-row-items"
        className="flex min-w-0 flex-1 list-none flex-wrap content-start gap-1 p-1.5 @md:gap-2 @md:p-2"
      >
        {children}
      </ul>
    </li>
  );
}

/** One entry of a TierRow. Put a `TierTile` in it, or any content of the entry's own. */
export function TierItem({ className, ...props }: React.ComponentProps<"li">) {
  return <li data-slot="tier-item" className={cn("flex min-w-0", className)} {...props} />;
}

/** The line a TierRow shows when nothing earned its grade. */
export function TierEmpty({ className, children = "Nothing in this tier", ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="tier-empty"
      className={cn("flex min-h-16 items-center px-2 text-xs text-muted-foreground", className)}
      {...props}
    >
      {children}
    </li>
  );
}

/**
 * The pressable face of an entry: an image over a name and a number. A link by default; `asChild` puts the look on
 * a router link. Children are laid out in a column and centred.
 */
export function TierTile({
  asChild = false,
  className,
  ...props
}: React.ComponentProps<"a"> & {
  asChild?: boolean;
}) {
  const Comp = asChild ? Slot.Root : "a";
  return (
    <Comp
      data-slot="tier-tile"
      className={cn(
        FOCUS_RING,
        "flex w-16 flex-col items-center gap-1 rounded-lg p-1 text-center transition-colors hover:bg-accent @md:w-20 @md:p-1.5",
        className,
      )}
      {...props}
    />
  );
}

const tierBadgeVariants = cva(
  "inline-flex shrink-0 items-center justify-center rounded-md leading-none font-bold text-tier-foreground",
  {
    variants: {
      tier: { s: "bg-tier-s", a: "bg-tier-a", b: "bg-tier-b", c: "bg-tier-c", d: "bg-tier-d" },
      size: { sm: "size-5 text-xs", default: "size-6 text-sm" },
    },
    defaultVariants: { tier: "b", size: "default" },
  },
);

/**
 * A grade on its own, outside a list: the letter on its tier color, for a page that names where one entry stands (a
 * hero's tier on the hero page). Screen readers hear "S tier".
 */
export function TierBadge({
  tier = "b",
  size,
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & VariantProps<typeof tierBadgeVariants>) {
  const grade = tier ?? "b";
  return (
    <span
      data-slot="tier-badge"
      data-tier={grade}
      className={cn(tierBadgeVariants({ tier: grade, size }), className)}
      {...props}
    >
      <span aria-hidden="true">{grade.toUpperCase()}</span>
      <span className="sr-only">{`${grade.toUpperCase()} tier`}</span>
    </span>
  );
}
