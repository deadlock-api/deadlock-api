import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { Children, cloneElement, createContext, isValidElement, use } from "react";

import { useControllableState } from "~/components/ui/hooks/use-controllable-state";
import { NoValue } from "~/components/ui/no-value";
import { FOCUS_RING } from "~/components/ui/recipes";
import { Text } from "~/components/ui/text";
import { cn } from "~/lib/utils";

const tierLabelVariants = cva(
  "flex items-center justify-center border-s-4 text-2xl leading-none font-bold text-foreground",
  {
    variants: {
      tier: {
        s: "border-tier-s bg-tier-s/15",
        a: "border-tier-a bg-tier-a/15",
        b: "border-tier-b bg-tier-b/15",
        c: "border-tier-c bg-tier-c/15",
        d: "border-tier-d bg-tier-d/15",
      },
    },
    defaultVariants: { tier: "b" },
  },
);

type TierVariant = NonNullable<VariantProps<typeof tierLabelVariants>["tier"]>;

const tierContentVariants = cva("grid min-w-0 gap-x-3 gap-y-2 p-1.5", {
  variants: {
    /** How many `TierGroup` columns a row splits into once the list is wide enough; `1` for a plain row of items. */
    columns: {
      1: "",
      2: "@2xl/tier-list:grid-cols-2",
      3: "@3xl/tier-list:grid-cols-3",
      4: "@4xl/tier-list:grid-cols-4",
    },
  },
  defaultVariants: { columns: 1 },
});

type TierColumns = NonNullable<VariantProps<typeof tierContentVariants>["columns"]>;

/** Grouped rows sit side by side from this container width on; below it each group stacks under its own label. */
const WIDE_LABEL = {
  1: "",
  2: "@2xl/tier-list:sr-only",
  3: "@3xl/tier-list:sr-only",
  4: "@4xl/tier-list:sr-only",
} as const satisfies Record<TierColumns, string>;
const WIDE_HEAD = {
  2: "@2xl/tier-list:grid",
  3: "@3xl/tier-list:grid",
  4: "@4xl/tier-list:grid",
} as const;
/** An empty group only keeps its cell where groups line up in columns; stacked, it would be a label over nothing. */
const WIDE_ONLY = {
  1: "",
  2: "hidden @2xl/tier-list:flex",
  3: "hidden @3xl/tier-list:flex",
  4: "hidden @4xl/tier-list:flex",
} as const satisfies Record<TierColumns, string>;
const HEAD_COLUMNS = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" } as const;

/** Which entry of a list is highlighted, so every tile of it lights up wherever it appears. */
const TierHighlightContext = createContext<{
  value: string | null;
  onValueChange: (value: string | null) => void;
} | null>(null);

/**
 * Things ranked into tiers, best first: an ordered list of `TierRow`s on one card. Rows hold `TierItem`s, or, split
 * by a second dimension, `TierGroup`s under a `TierListHead`. Sizes to its container, not the viewport.
 *
 * An entry that appears more than once (in several groups) shares a `value` on its `TierItem`s: pointing at or
 * focusing one highlights all of them. `value` / `defaultValue` / `onValueChange` hold the highlighted entry.
 */
function TierList({
  value,
  defaultValue = null,
  onValueChange,
  className,
  ...props
}: Omit<React.ComponentProps<"ol">, "defaultValue"> & {
  value?: string | null;
  defaultValue?: string | null;
  onValueChange?: (value: string | null) => void;
}) {
  const [highlighted, setHighlighted] = useControllableState({ value, defaultValue, onValueChange });
  return (
    <TierHighlightContext value={{ value: highlighted, onValueChange: setHighlighted }}>
      <ol
        data-slot="tier-list"
        className={cn(
          "@container/tier-list flex flex-col divide-y divide-border overflow-hidden rounded-lg border bg-card",
          className,
        )}
        {...props}
      />
    </TierHighlightContext>
  );
}

/**
 * The column names of grouped rows, shown once above them while the groups sit side by side. Assistive technology
 * reads each `TierGroup`'s own label instead, so this row is hidden from it.
 */
function TierListHead({
  columns = 4,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"li">, "aria-hidden"> & { columns?: Exclude<TierColumns, 1> }) {
  return (
    <li
      data-slot="tier-list-head"
      aria-hidden="true"
      className={cn("hidden grid-cols-[3rem_minmax(0,1fr)] bg-muted", WIDE_HEAD[columns], className)}
      {...props}
    >
      <span />
      <span className={cn("grid gap-x-3 px-1.5 py-1", HEAD_COLUMNS[columns])}>
        {Children.map(children, (child) => (
          <Text variant="label" tone="muted" wrap="truncate">
            {child}
          </Text>
        ))}
      </span>
    </li>
  );
}

/**
 * One tier: its letter (or `label`) at the start, its items after. With no children it says so instead of collapsing.
 * `columns` lays out `TierGroup` children side by side on a wide container.
 */
function TierRow({
  tier = "b",
  label,
  columns = 1,
  labelAs = "span",
  className,
  children,
  ...props
}: React.ComponentProps<"li"> & {
  tier?: TierVariant;
  /** A heading level when the tiers belong in the page outline ("S tier" under the list's section title). */
  labelAs?: "span" | "h2" | "h3" | "h4";
  /** What the tier is called; the tier's letter by default. Screen readers hear it followed by "tier". */
  label?: string;
  columns?: TierColumns;
}) {
  const name = label ?? tier.toUpperCase();
  const Label = labelAs;
  const empty = Children.count(children) === 0;
  return (
    <li
      data-slot="tier-row"
      data-tier={tier}
      className={cn("grid grid-cols-[3rem_minmax(0,1fr)]", className)}
      {...props}
    >
      <Label data-slot="tier-row-label" className={tierLabelVariants({ tier })}>
        {name}
        <span className="sr-only"> tier</span>
      </Label>
      {empty ? (
        <span className="flex items-center px-3 py-4">
          <NoValue label={`No entries in ${name} tier`} />
        </span>
      ) : columns === 1 ? (
        <ul data-slot="tier-row-items" className="flex min-w-0 flex-wrap gap-1 p-1.5">
          {children}
        </ul>
      ) : (
        <div data-slot="tier-row-groups" data-columns={columns} className={tierContentVariants({ columns })}>
          {Children.map(children, (child) =>
            isValidElement<{ columns?: TierColumns }>(child) ? cloneElement(child, { columns }) : child,
          )}
        </div>
      )}
    </li>
  );
}

/**
 * The items of one tier that share a second dimension (a role, a class). Its label shows above the items while groups
 * stack, and moves to the `TierListHead` once they sit side by side. An empty group is a blank cell in that grid and is
 * left out while groups stack; screen readers hear that it is empty.
 */
function TierGroup({
  label,
  columns = 4,
  className,
  children,
  ...props
}: React.ComponentProps<"section"> & {
  label: string;
  /** Set by the `TierRow`. */
  columns?: TierColumns;
}) {
  const empty = Children.count(children) === 0;
  return (
    <section
      data-slot="tier-group"
      aria-label={label}
      className={cn("flex min-w-0 flex-col gap-1", empty && WIDE_ONLY[columns], className)}
      {...props}
    >
      <Text variant="label" tone="muted" className={cn("px-1", WIDE_LABEL[columns])}>
        {label}
      </Text>
      {empty ? (
        <span className="sr-only">No {label} entries</span>
      ) : (
        <ul className="flex min-w-0 flex-wrap gap-1">{children}</ul>
      )}
    </section>
  );
}

/**
 * One ranked thing: its picture, its name and one reading under it. Pass a link through `asChild` (a router `Link`)
 * to make the whole tile the link; its own children are ignored.
 */
function TierItem({
  media,
  name,
  meta,
  value,
  asChild = false,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"span">, "title"> & {
  media?: React.ReactNode;
  name: string;
  /** One short reading under the name, such as a win rate. */
  meta?: React.ReactNode;
  /** Identifies the entry across the list: every item with the same value highlights together. */
  value?: string;
  asChild?: boolean;
}) {
  const highlight = use(TierHighlightContext);
  const highlighted = value != null && highlight?.value === value;
  const track =
    value != null && highlight
      ? {
          onPointerEnter: () => highlight.onValueChange(value),
          onPointerLeave: () => highlight.onValueChange(null),
          onFocus: () => highlight.onValueChange(value),
          onBlur: () => highlight.onValueChange(null),
        }
      : {};
  const body = (
    <>
      {media && (
        <span data-slot="tier-item-media" className="flex size-10 items-center justify-center">
          {media}
        </span>
      )}
      <Text variant="caption" tone="default" align="center" wrap="truncate" className="w-full">
        {name}
      </Text>
      {meta != null && (
        <Text variant="caption" tone="muted" align="center" numeric="tabular" wrap="truncate" className="w-full">
          {meta}
        </Text>
      )}
    </>
  );
  const rootProps = {
    "data-slot": "tier-item",
    "data-highlighted": highlighted || undefined,
    ...track,
    className: cn(
      FOCUS_RING,
      "flex w-18 flex-col items-center gap-0.5 rounded-md p-1",
      "transition-colors duration-fast ease-standard",
      asChild && "hover:bg-subtle-hover active:bg-subtle-active",
      // Every tile of the entry being pointed at, in whichever group it sits.
      "data-highlighted:bg-primary/15 data-highlighted:ring-1 data-highlighted:ring-primary/60 data-highlighted:ring-inset",
      className,
    ),
    ...props,
  };
  const link = asChild && isValidElement(children) ? children : null;
  return (
    <li className="flex">
      {link ? (
        <Slot.Root {...rootProps}>{cloneElement(link, undefined, body)}</Slot.Root>
      ) : (
        <span {...rootProps}>{body}</span>
      )}
    </li>
  );
}

export { TierGroup, TierItem, TierList, TierListHead, TierRow };
export type { TierColumns, TierVariant };
