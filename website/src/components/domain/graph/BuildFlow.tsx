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
  titleDisplay = "visible",
  surface = "plain",
  meta,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"section">, "title"> & {
  /** "0–9m", "Round 3". */
  title: React.ReactNode;
  /** `hidden`: the title names the section for screen readers only, where the card around it already shows it. */
  titleDisplay?: "visible" | "hidden";
  /** `inset`: a recessed well, set apart from what else the card around it holds (the build's own items). */
  surface?: "plain" | "inset";
  /** Beside the title: "97% of games". */
  meta?: React.ReactNode;
}) {
  return (
    <section
      data-slot="build-stage"
      data-surface={surface}
      className={cn(
        "@container flex min-w-0 flex-col gap-1 transition-opacity duration-normal ease-standard aria-busy:opacity-50",
        surface === "inset" && "rounded-md border border-hairline bg-card p-1",
        className,
      )}
      {...props}
    >
      {titleDisplay === "hidden" ? (
        <Heading as="h3" size="sm" className="sr-only">
          {title}
        </Heading>
      ) : (
        <header className="flex min-h-7 items-baseline justify-between gap-2 border-b border-hairline pb-1">
          <Heading as="h3" size="sm">
            {title}
          </Heading>
          {meta && <span className="truncate type-caption text-muted-foreground tabular-nums">{meta}</span>}
        </header>
      )}
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
      className={cn("flex items-center justify-between gap-2 px-1.5 type-caption text-muted-foreground", className)}
      {...props}
    >
      {/* Not cut: a sort button here needs its focus ring drawn outside it. */}
      <span className="min-w-0 whitespace-nowrap">{start}</span>
      <span className={cn("min-w-fit shrink-0 text-end whitespace-nowrap", VALUE_WIDTH)}>{end}</span>
    </div>
  );
}

// The win rate column and the bought bar grow with the stage's width: a wide stage gives its bars room to read.
const VALUE_WIDTH = "w-12 @xs:w-14 @sm:w-20 @md:w-28";
// On one line, the figures beside the name keep one width, linked or not: the name's room does not change on hover.
const META_WIDTH = "@md:w-36 @md:shrink-0";
// Under 16rem a stage has no room for the bar beside the figures (an over-budget price ran into the win rate): the
// figures stay, the bar goes.
const SHARE_WIDTH = "hidden w-8 min-w-3 @3xs:block @xs:w-12 @sm:w-16 @md:w-12";

const buildChoiceVariants = cva(
  [
    FOCUS_RING,
    "group/choice flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-md border border-transparent px-1.5 py-1 text-start transition duration-fast ease-standard",
    "hover:bg-accent aria-pressed:border-primary/50 aria-pressed:bg-primary/15 aria-pressed:hover:bg-primary/20",
  ],
  {
    variants: {
      /**
       * How the row stands to the choice under the pointer in a neighbouring stage: `linked` was bought with it,
       * `unlinked` was not and steps back: its art and bars fade and its name turns muted, while every figure keeps
       * its text contrast. `none` while nothing is pointed at.
       */
      relation: {
        none: "",
        linked: "border-info/50 bg-subtle-hover",
        unlinked: [
          "text-muted-foreground",
          "[&_[data-slot=build-choice-media]]:opacity-40 [&_[data-slot=diverging-bar]]:opacity-40 [&_[data-slot=progress-bar]]:opacity-40",
        ],
      },
    },
    defaultVariants: { relation: "none" },
  },
);

// What the value's tone says, in words, for a screen reader: the color alone does not reach it.
const TONE_WORDS: Partial<Record<Tone, string>> = {
  positive: "above the build",
  negative: "below the build",
  muted: "within noise",
};

/**
 * One choice of a stage, a toggle button (`aria-pressed`): the item, its name, a line under it with the share of
 * players who take it (`share` draws it as a bar), and its win rate at the end with a signed bar against the
 * reference. A `linked` row shows `link` in that line instead: how it stands to the choice pointed at (the share of
 * that item's buyers who also bought this one).
 *
 * Its accessible name is composed from its own parts, so a caller cannot drop one: the name, "bought" and the meta (or
 * the link), the price ("over budget" with `overBudget`), "win rate" and the value, and with a `change` the tone in
 * words ("above the build", "below the build", "within noise"). The media is decorative; do not pass an `aria-label`.
 */
export function BuildChoice({
  media,
  name,
  meta,
  share,
  price,
  overBudget = false,
  link,
  value,
  tone = "muted",
  change,
  selected = false,
  relation,
  className,
  ...props
}: Omit<React.ComponentProps<"button">, "name" | "value" | "type" | "children" | "aria-label"> &
  VariantProps<typeof buildChoiceVariants> & {
    media: React.ReactNode;
    name: React.ReactNode;
    /** The line under the name: "28.7%". */
    meta?: React.ReactNode;
    /** 0 to 1: the meta drawn as a bar, scaled to the stage. */
    share?: number;
    /** At the end of the meta line: what it costs, "3,200". Stays while the row is `linked`. */
    price?: React.ReactNode;
    /** The price is more than the stage has left: in the loss color with a warning mark, "over budget" in words. */
    overBudget?: boolean;
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
      <span aria-hidden="true" data-slot="build-choice-media" className="relative shrink-0">
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
      {/* Name over its line where the stage is narrow; one line, name first, where it is wide. */}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 @md:flex-row @md:items-center @md:gap-3">
        <span className="line-clamp-2 type-label leading-tight wrap-break-word @md:line-clamp-none @md:min-w-0 @md:flex-1 @md:truncate">
          {name}
        </span>
        {link && relation === "linked" ? (
          <span
            className={cn(
              "flex min-w-0 items-center gap-1.5 type-caption font-semibold text-info tabular-nums",
              META_WIDTH,
            )}
          >
            <ProgressBar variant="thin" value={link.share} color="var(--info)" className={SHARE_WIDTH} />
            <span className="shrink-0">
              <span className="sr-only">, </span>
              {link.label}
            </span>
            {price && <ChoicePrice price={price} overBudget={overBudget} className="font-normal" />}
          </span>
        ) : (
          <span
            className={cn(
              "flex min-w-0 items-center gap-1.5 type-caption text-muted-foreground tabular-nums",
              META_WIDTH,
            )}
          >
            {share !== undefined && (
              <ProgressBar variant="thin" value={share} color="var(--chart-share)" className={SHARE_WIDTH} />
            )}
            {/* The bar gives way before the figures do. */}
            {meta && (
              <span className="shrink-0">
                <span className="sr-only">, bought </span>
                {meta}
              </span>
            )}
            {price && <ChoicePrice price={price} overBudget={overBudget} />}
          </span>
        )}
      </span>
      <span
        className={cn(
          "flex shrink-0 flex-col items-end gap-0.5 @md:flex-row-reverse @md:items-center @md:gap-2",
          VALUE_WIDTH,
        )}
      >
        <span className={cn("type-label tabular-nums @md:w-12 @md:shrink-0 @md:text-end", TONE_TEXT[tone])}>
          <span className="sr-only">, win rate </span>
          {value ?? <NoValue />}
          {change && TONE_WORDS[tone] && <span className="sr-only">, {TONE_WORDS[tone]}</span>}
        </span>
        {change && (
          <DivergingBar
            value={change.value}
            scale={change.scale}
            interval={change.interval}
            className="w-full @md:min-w-0 @md:flex-1"
          />
        )}
      </span>
    </button>
  );
}

/** A choice's price after its meta: "· 3,200", or in the loss color with a warning mark when it is over budget. */
function ChoicePrice({
  price,
  overBudget,
  className,
}: {
  price: React.ReactNode;
  overBudget: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-0.5", className, overBudget && "text-negative")}>
      <span aria-hidden="true">·</span>
      <span className="sr-only">, costs </span>
      {overBudget && <TriangleAlertIcon aria-hidden="true" className="size-3" />}
      {price}
      {overBudget && <span className="sr-only">, over budget</span>}
    </span>
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
 * One stage of a BuildBoard, three rows where the board is four across, on the board's shared row tracks so the slots'
 * parts line up from slot to slot: its name with a `meta` (its BuildBudget, `inline`) and an `action` (an add button) at
 * the end of that line, the `BuildSlotItem`s of the stage (bought, or sold there), "Empty" without any, and a `footer`
 * (one element: the items to add, a budget bar).
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
        "flex min-w-0 flex-col gap-2 rounded-md border border-hairline bg-subtle p-2 transition-colors duration-fast ease-standard data-drop:border-primary data-drop:bg-primary/10 data-empty:border-dashed data-empty:bg-transparent @4xl:row-span-3 @4xl:grid @4xl:grid-cols-1 @4xl:grid-rows-subgrid",
        className,
      )}
      {...props}
    >
      {/* The meta and action at the end of the label's line; on a line of their own, at its end, where they do not fit. */}
      {/* Lines packed at the top: a neighbour's two-line header makes the shared row taller than this one. */}
      <span className="flex min-h-6 flex-wrap content-start items-center gap-x-2 gap-y-0.5 type-caption text-muted-foreground">
        <span className="min-w-0 truncate font-medium text-foreground">{label}</span>
        <span className="ms-auto flex min-w-0 items-center gap-2">
          {meta && <span className="min-w-0 tabular-nums">{meta}</span>}
          {action}
        </span>
      </span>
      <ul className="@container flex min-h-8 flex-1 flex-col gap-1">
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
      suggested: "border border-dashed border-hairline px-1 py-0.5",
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
      {/* Name over its line where the slot is narrow; one line, name first, where it is wide. */}
      <span className="flex min-w-0 flex-1 flex-col @md:flex-row @md:items-baseline @md:gap-2">
        <span data-slot="build-slot-item-name" className="truncate type-label @md:max-w-1/2 @md:shrink-0">
          {name}
        </span>
        {/* One line, cut at the card's edge (two for a suggestion). A suggestion says so in words as well as by its
            dashed frame: it is not part of the build until added. */}
        {(meta || state === "suggested") && (
          <span
            className={cn(
              "type-caption text-muted-foreground tabular-nums",
              // A suggestion's rate and games stay whole on two lines: it stands alone in its stage.
              state === "suggested" ? "line-clamp-2" : "truncate",
            )}
          >
            {state === "suggested" && <span className="font-medium">Suggested{meta ? " · " : ""}</span>}
            {meta}
          </span>
        )}
      </span>
      {actions && <span className="flex shrink-0 items-center">{actions}</span>}
    </li>
  );
}

/**
 * What a build has spent by the end of a stage against what a player has earned by then, and with `slots` the item
 * slots it fills against those open: `bar` draws the spending as a bar over the figures (one line where it is wide),
 * `inline` is the figures alone, for a slot's header. In the loss color with a warning mark once spending passes
 * earnings or the items pass the slots.
 */
export function BuildBudget({
  spent,
  available,
  slots,
  variant = "bar",
  format = (n) => n.toLocaleString("en-US"),
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  spent: number;
  available: number;
  /** Items held at the end of the stage against the slots open by then. */
  slots?: { used: number; open: number };
  variant?: "bar" | "inline";
  /** Prints a soul amount: "6.7k". */
  format?: (souls: number) => string;
}) {
  const overSouls = spent > available;
  const overSlots = slots != null && slots.used > slots.open;
  const figures = (
    <span
      className={cn(
        "flex min-w-0 items-center gap-1 type-caption text-muted-foreground tabular-nums",
        variant === "inline" ? "gap-2" : "@md:shrink-0 @md:gap-3",
      )}
    >
      {(overSouls || overSlots) && <TriangleAlertIcon aria-hidden="true" className="size-3 shrink-0 text-negative" />}
      <span className={cn("truncate", overSouls && "text-negative")}>
        {format(spent)} of {format(available)} souls
      </span>
      {slots && (
        <span className={cn("shrink-0", variant === "bar" && "ms-auto", overSlots && "text-negative")}>
          {slots.used}/{slots.open} slots
        </span>
      )}
    </span>
  );
  return (
    <div
      data-slot="build-budget"
      data-variant={variant}
      data-over={overSouls || overSlots || undefined}
      className={cn(
        variant === "bar" && "@container",
        variant === "inline" && "inline-flex max-w-full min-w-0",
        className,
      )}
      {...props}
    >
      {variant === "inline" ? (
        figures
      ) : (
        // The bar over its figures where the card is narrow; the bar, then the figures, on one line where it is wide.
        <div className="flex flex-col gap-1 @md:flex-row @md:items-center @md:gap-3">
          <ProgressBar
            variant="thin"
            value={available > 0 ? Math.min(1, spent / available) : 1}
            color={overSouls ? "var(--negative)" : "var(--chart-share)"}
            className="w-full @md:min-w-0 @md:flex-1"
          />
          {figures}
        </div>
      )}
    </div>
  );
}
