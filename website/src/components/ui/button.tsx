import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";

import { DISABLED_STATE, FOCUS_RING_BORDER, INVALID_STATE, SVG_SLOT } from "~/components/ui/recipes";
import { Spinner } from "~/components/ui/spinner";
import { cn } from "~/lib/utils";

const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-all",
    FOCUS_RING_BORDER,
    // Pressed is a nudge rather than a color, so it reads the same on every variant and next to a color-blind eye.
    "active:translate-y-px aria-disabled:active:translate-y-0",
    DISABLED_STATE,
    // `aria-disabled` is the unavailable action that must stay focusable, so it keeps its events and only stops
    // reacting to the pointer.
    "aria-disabled:cursor-default aria-disabled:opacity-50 aria-disabled:hover:bg-inherit aria-disabled:hover:text-inherit",
    INVALID_STATE,
    SVG_SLOT,
  ],
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/40",
        outline: "border border-input bg-input/30 shadow-xs hover:bg-input/50 hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent/50 hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        soft: "border border-primary/30 bg-primary/10 text-primary hover:bg-primary/15",
        subtle: "border border-hairline bg-subtle text-muted-foreground hover:bg-subtle-hover hover:text-foreground",
        "destructive-soft": "border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15",
        "positive-soft": "border border-positive/30 bg-positive/10 text-positive hover:bg-positive/20",
        "negative-soft": "border border-negative/30 bg-negative/10 text-negative hover:bg-negative/15",
        /** "Sign in through Steam" only: Valve's brand surface, the same in both themes. */
        steam: "border border-steam-border bg-steam-bg font-semibold text-foreground hover:bg-steam-bg-hover",
        /** A name inside a clickable row: no box of its own, it keeps the surrounding type and only recolors. */
        text: "h-auto rounded-sm p-0 text-inherit hover:text-primary",
        /** A full-width row of a list or panel that acts as one button. Bring your own layout inside. */
        row: "h-auto w-full justify-start rounded-none text-start font-normal whitespace-normal hover:bg-subtle-hover focus-visible:bg-subtle-hover aria-[current]:bg-accent aria-[current]:hover:bg-accent data-selected:bg-accent data-selected:hover:bg-accent",
      },
      shape: {
        default: "",
        pill: "rounded-full",
      },
      /** `raised` lifts a button that floats over page content, such as a launcher pinned to a corner. */
      elevation: {
        none: "",
        raised: "shadow-lg hover:shadow-xl",
      },
      /**
       * A translucent button over artwork needs something to sit on, or its label fights the picture behind it. It
       * is a backdrop, not a fill: it is drawn on `::before` below the label and above the variant's own surface,
       * which a second `bg-*` in the same class list would otherwise replace.
       */
      scrim: {
        none: "",
        dark: "relative isolate before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:bg-scrim before:backdrop-blur-xs hover:before:bg-scrim-hover",
      },
      size: {
        default: "h-9 px-4 py-2 text-sm has-[>svg]:px-3",
        xs: "h-6 gap-1 px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3 text-sm has-[>svg]:px-2.5",
        lg: "h-10 px-6 text-sm has-[>svg]:px-4",
        icon: "size-9 text-sm",
        "icon-xs": "size-6 text-sm [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 text-sm",
        "icon-lg": "size-10 text-sm",
        /**
         * For `variant="link"` inside a sentence: no box of its own. It is the one size without a type size, so it
         * takes the size of the text around it; that is why the sizes, not the base, carry `text-sm`.
         */
        inline: "h-auto gap-1 p-0",
      },
    },
    // `shape` owns the radius, so a pill stays a pill at every size. A size that wants its own default radius says
    // so here, against `shape="default"` only.
    compoundVariants: [{ size: "inline", shape: "default", class: "rounded-sm" }],
    defaultVariants: {
      variant: "default",
      shape: "default",
      size: "default",
      elevation: "none",
      scrim: "none",
    },
  },
);

const SPINNER_SIZE: Partial<Record<NonNullable<VariantProps<typeof buttonVariants>["size"]>, "xs" | "sm">> = {
  xs: "xs",
  "icon-xs": "xs",
  sm: "sm",
  "icon-sm": "sm",
  inline: "sm",
};

function Button({
  className,
  variant = "default",
  shape = "default",
  size = "default",
  elevation = "none",
  scrim = "none",
  asChild = false,
  loading = false,
  loadingLabel = "Loading",
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    /**
     * The action is running. The button keeps its place in the tab order and announces itself busy, and its
     * activation is ignored until it finishes — a disabled button would drop focus mid-action.
     */
    loading?: boolean;
    /** What the spinner announces; name the action for a button whose label does not survive the wait. */
    loadingLabel?: string;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-loading={loading || undefined}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      className={cn(
        buttonVariants({ variant, shape, size, elevation, scrim, className }),
        loading && "cursor-progress",
      )}
      {...props}
      onClick={(event) => {
        if (loading) {
          event.preventDefault();
          return;
        }
        props.onClick?.(event);
      }}
    >
      {loading && !asChild ? (
        <>
          <Spinner size={SPINNER_SIZE[size ?? "default"]} label={loadingLabel} />
          {children}
        </>
      ) : (
        children
      )}
    </Comp>
  );
}

export { Button, buttonVariants };
