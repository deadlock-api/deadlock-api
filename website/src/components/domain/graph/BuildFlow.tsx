import { cva, type VariantProps } from "class-variance-authority";
import { CheckIcon, PlusIcon, TriangleAlertIcon } from "lucide-react";
import { Children, isValidElement } from "react";

import { Heading } from "~/components/ui/heading";
import { NoValue } from "~/components/ui/no-value";
import { ProgressBar } from "~/components/ui/progress-bar";
import { DivergingBar } from "~/components/ui/rate-bar";
import { FOCUS_RING } from "~/components/ui/recipes";
import { TONE_TEXT, type Tone } from "~/lib/tone";
import { cn } from "~/lib/utils";

/**
 * One stage of a build (a time phase, a round): its name, a quiet line beside it (how many games reach it) and its
 * choices below. A stage of a build flow sits in a `Grid` next to the others. `aria-busy` fades it while the numbers it
 * shows are about to be replaced.
 */
export function BuildStage({
  title,
  meta,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"section">, "title"> & {
  /** "0–9m", "Round 3". */
  title: React.ReactNode;
  /** Beside the title: "97% of games". */
  meta?: React.ReactNode;
}) {
  return (
    <section
      data-slot="build-stage"
      className={cn(
        "@container flex min-w-0 flex-col gap-1.5 transition-opacity duration-normal ease-standard aria-busy:opacity-50",
        className,
      )}
      {...props}
    >
      <header className="flex min-h-7 items-baseline justify-between gap-2 border-b border-hairline pb-1">
        <Heading as="h3" size="sm">
          {title}
        </Heading>
        {meta && <span className="truncate type-caption text-muted-foreground tabular-nums">{meta}</span>}
      </header>
      {children}
    </section>
  );
}

/**
 * The choices of a BuildStage: `BuildChoice` rows, one list item apiece. Label it
 * (`aria-label`) with the stage.
 */
export function BuildChoiceList({ className, children, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul data-slot="build-choice-list" className={cn("flex min-w-0 flex-col gap-0.5", className)} {...props}>
      {Children.map(children, (child) =>
        isValidElement(child) ? (
          <li key={child.key} className="min-w-0">
            {child}
          </li>
        ) : (
          child
        ),
      )}
    </ul>
  );
}

/** The column names over a BuildChoiceList: what the line under each name means and what the number at the end is. */
export function BuildChoiceHeader({
  start,
  end,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & { start: React.ReactNode; end: React.ReactNode }) {
  return (
    <div
      data-slot="build-choice-header"
      aria-hidden="true"
      className={cn("flex items-center justify-between gap-2 px-2 type-caption text-muted-foreground", className)}
      {...props}
    >
      <span className="truncate">{start}</span>
      <span className={cn("shrink-0 text-end", VALUE_WIDTH)}>{end}</span>
    </div>
  );
}

// The win rate column and the bought bar grow with the stage's width: a wide stage gives its bars room to read.
const VALUE_WIDTH = "w-12 @xs:w-16 @sm:w-24 @md:w-32";
const SHARE_WIDTH = "w-10 min-w-3 @xs:w-16 @sm:w-20 @md:w-24";

const buildChoiceVariants = cva(
  [
    FOCUS_RING,
    "group/choice flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-start transition duration-fast ease-standard",
    "hover:bg-accent aria-pressed:border-primary/50 aria-pressed:bg-primary/15 aria-pressed:hover:bg-primary/20",
  ],
  {
    variants: {
      /**
       * How the row stands to the choice under the pointer in a neighbouring stage: `linked` was bought with it,
       * `unlinked` was not and fades back, `none` while nothing is pointed at.
       */
      relation: {
        none: "",
        linked: "border-info/50 bg-subtle-hover",
        unlinked: "opacity-40",
      },
    },
    defaultVariants: { relation: "none" },
  },
);

/**
 * One choice of a stage, a toggle button (`aria-pressed`): the item, its name, a line under it with the share of
 * players who take it (`share` draws it as a bar), and its win rate at the end with a signed bar against the
 * reference. A `linked` row shows `link` in that line instead: how it stands to the choice pointed at (the share of
 * that item's buyers who also bought this one).
 */
export function BuildChoice({
  media,
  name,
  meta,
  share,
  price,
  link,
  value,
  tone = "muted",
  change,
  selected = false,
  relation,
  className,
  ...props
}: Omit<React.ComponentProps<"button">, "name" | "value" | "type" | "children"> &
  VariantProps<typeof buildChoiceVariants> & {
    media: React.ReactNode;
    name: React.ReactNode;
    /** The line under the name: "28.7%". */
    meta?: React.ReactNode;
    /** 0 to 1: the meta drawn as a bar, scaled to the stage. */
    share?: number;
    /** At the end of the meta line: what it costs, "3,200". Stays while the row is `linked`. */
    price?: React.ReactNode;
    /** Replaces `meta` and `share` while the row is `linked`: the text and its 0 to 1 bar. */
    link?: { label: React.ReactNode; share: number };
    /** The number at the end: "52.4%". */
    value: React.ReactNode;
    /** The value's color; the bar under it carries the sign as well. */
    tone?: Tone;
    /** A signed value under the number, with its uncertainty: `scale` is where it reaches the edge. */
    change?: { value: number; scale: number; interval?: readonly [number, number] };
    /** In the build: primary frame, a check, `aria-pressed`. */
    selected?: boolean;
  }) {
  return (
    // ds-allow raw-button: the hit area of a bespoke build-flow row, with its own selected and linked states
    <button
      type="button"
      data-slot="build-choice"
      aria-pressed={selected}
      className={cn(buildChoiceVariants({ relation }), className)}
      {...props}
    >
      <span className="relative shrink-0">
        {media}
        {/* A check on a chosen row; a plus on the row under the pointer or the keyboard, which it would add. */}
        <span
          aria-hidden="true"
          className={cn(
            "absolute -inset-e-1 -top-1 flex size-4 items-center justify-center rounded-full transition duration-fast ease-standard",
            selected
              ? "bg-primary text-primary-foreground"
              : "bg-foreground text-background opacity-0 group-hover/choice:opacity-100 group-focus-visible/choice:opacity-100",
          )}
        >
          {selected ? <CheckIcon className="size-3" /> : <PlusIcon className="size-3" />}
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="line-clamp-2 type-label leading-tight wrap-break-word">{name}</span>
        {link && relation === "linked" ? (
          <span className="flex min-w-0 items-center gap-1.5 type-caption font-semibold text-info tabular-nums">
            <ProgressBar variant="thin" value={link.share} color="var(--info)" className={SHARE_WIDTH} />
            <span className="shrink-0">{link.label}</span>
            {price && <span className="shrink-0 font-normal text-muted-foreground">· {price}</span>}
          </span>
        ) : (
          <span className="flex min-w-0 items-center gap-1.5 type-caption text-muted-foreground tabular-nums">
            {share !== undefined && (
              <ProgressBar variant="thin" value={share} color="var(--chart-share)" className={SHARE_WIDTH} />
            )}
            {/* The bar gives way before the figures do. */}
            <span className="shrink-0">{meta}</span>
            {price && <span className="shrink-0">· {price}</span>}
          </span>
        )}
      </span>
      <span className={cn("flex shrink-0 flex-col items-end gap-1", VALUE_WIDTH)}>
        <span className={cn("type-label tabular-nums", TONE_TEXT[tone])}>{value ?? <NoValue />}</span>
        {change && (
          <DivergingBar value={change.value} scale={change.scale} interval={change.interval} className="w-full" />
        )}
      </span>
    </button>
  );
}

/** The build being designed: one `BuildSlot` per stage, four across when there is room, then two, one on a phone. */
export function BuildBoard({ className, ...props }: React.ComponentProps<"ol">) {
  return (
    <div data-slot="build-board" className="@container min-w-0">
      <ol className={cn("grid min-w-0 grid-cols-1 gap-2 @md:grid-cols-2 @4xl:grid-cols-4", className)} {...props} />
    </div>
  );
}

/**
 * One stage of a BuildBoard: its name, a figure at the end of that line (the stage's spending) and an `action` after it
 * (an add button), the `BuildSlotItem`s of the stage (bought, or sold there), "Empty" without any, and a `footer` (its
 * BuildBudget).
 */
export function BuildSlot({
  label,
  meta,
  action,
  footer,
  drop = "none",
  className,
  children,
  ...props
}: React.ComponentProps<"li"> & {
  label: React.ReactNode;
  meta?: React.ReactNode;
  action?: React.ReactNode;
  footer?: React.ReactNode;
  /** `over`: an item is dragged over the slot and would move here on drop. */
  drop?: "none" | "over";
}) {
  const empty = Children.toArray(children).length === 0;
  return (
    <li
      data-slot="build-slot"
      data-empty={empty || undefined}
      data-drop={drop === "over" || undefined}
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-md border border-hairline bg-subtle p-2 transition-colors duration-fast ease-standard data-drop:border-primary data-drop:bg-primary/10 data-empty:border-dashed data-empty:bg-transparent",
        className,
      )}
      {...props}
    >
      <span className="flex min-h-6 items-center gap-2 type-caption text-muted-foreground">
        <span className="flex-1 truncate font-medium text-foreground">{label}</span>
        {meta && <span className="shrink-0 tabular-nums">{meta}</span>}
        {action}
      </span>
      <ul className="flex min-h-10 flex-1 flex-col gap-1">
        {empty ? <li className="flex flex-1 items-center type-caption text-muted-foreground">Empty</li> : children}
      </ul>
      {footer}
    </li>
  );
}

const buildSlotItemVariants = cva("flex min-w-0 items-center gap-2 rounded-sm", {
  variants: {
    /**
     * `held`: bought in this stage. `sold`: bought earlier and sold in this stage, faded and struck through.
     * `suggested`: not in the build, offered to add, in a dashed frame.
     */
    state: {
      held: "",
      sold: "opacity-60 [&_[data-slot=build-slot-item-name]]:line-through",
      suggested: "border border-dashed border-hairline p-1",
    },
  },
  defaultVariants: { state: "held" },
});

/**
 * One item of a BuildSlot: its art, name, a meta line (price, how often it is sold) and `actions` at the end. With
 * `draggable` it shows the grab cursor; the drag itself (moving it to another slot) is the board's.
 */
export function BuildSlotItem({
  media,
  name,
  meta,
  actions,
  state,
  className,
  ...props
}: Omit<React.ComponentProps<"li">, "children"> &
  VariantProps<typeof buildSlotItemVariants> & {
    media: React.ReactNode;
    name: React.ReactNode;
    meta?: React.ReactNode;
    actions?: React.ReactNode;
  }) {
  return (
    <li
      data-slot="build-slot-item"
      data-state={state ?? "held"}
      className={cn(
        buildSlotItemVariants({ state }),
        props.draggable && "cursor-grab active:cursor-grabbing",
        className,
      )}
      {...props}
    >
      <span className="shrink-0">{media}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span data-slot="build-slot-item-name" className="truncate type-label">
          {name}
        </span>
        {meta && <span className="truncate type-caption text-muted-foreground tabular-nums">{meta}</span>}
      </span>
      {actions && <span className="flex shrink-0 items-center">{actions}</span>}
    </li>
  );
}

/**
 * What a build has spent by the end of a stage against what a player has earned by then: a bar and the two figures,
 * and with `slots` the item slots it fills against those open. In the loss color with a warning mark once spending
 * passes earnings or the items pass the slots.
 */
export function BuildBudget({
  spent,
  available,
  slots,
  format = (n) => n.toLocaleString("en-US"),
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  spent: number;
  available: number;
  /** Items held at the end of the stage against the slots open by then. */
  slots?: { used: number; open: number };
  /** Prints a soul amount: "6.7k". */
  format?: (souls: number) => string;
}) {
  const overSouls = spent > available;
  const overSlots = slots != null && slots.used > slots.open;
  return (
    <div
      data-slot="build-budget"
      data-over={overSouls || overSlots || undefined}
      className={cn("flex flex-col gap-1", className)}
      {...props}
    >
      <ProgressBar
        variant="thin"
        value={available > 0 ? Math.min(1, spent / available) : 1}
        color={overSouls ? "var(--negative)" : "var(--chart-share)"}
        className="w-full"
      />
      <span className="flex items-center gap-1 type-caption text-muted-foreground tabular-nums">
        {(overSouls || overSlots) && <TriangleAlertIcon aria-hidden="true" className="size-3 shrink-0 text-negative" />}
        <span className={cn("truncate", overSouls && "text-negative")}>
          {format(spent)} of {format(available)} souls
        </span>
        {slots && (
          <span className={cn("ms-auto shrink-0", overSlots && "text-negative")}>
            {slots.used}/{slots.open} slots
          </span>
        )}
      </span>
    </div>
  );
}
