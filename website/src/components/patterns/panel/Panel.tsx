import { cva, type VariantProps } from "class-variance-authority";
import { ChevronDownIcon, type LucideIcon } from "lucide-react";
import { createContext, createElement, use } from "react";

import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { HeadingLevel, useNextHeadingLevel } from "~/components/ui/heading";
import { useControllableState } from "~/components/ui/hooks/use-controllable-state";
import { SCROLLBAR_THIN } from "~/components/ui/recipes";
import { Text } from "~/components/ui/text";
import { cn } from "~/lib/utils";

/**
 * A titled block of a dashboard: header strip, body, optional footer. The parts bring their own padding and
 * dividers, so a table or a chart can run edge to edge.
 */
export function Panel({ className, ...props }: React.ComponentProps<typeof Card>) {
  return <Card size="flush" className={className} {...props} />;
}

const panelRowVariants = cva("grid gap-3", {
  variants: {
    /** The container width from which the panels sit side by side, two thirds and one third. */
    at: {
      "3xl": "@3xl/panel-row:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]",
      "5xl": "@5xl/panel-row:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]",
    },
    /**
     * `fixed`: side by side, every panel takes `--panel-aligned-height`, whatever its content. `fit`: the row is as
     * tall as its tallest panel's content, up to `--panel-aligned-height`, and the others stretch to it: no empty room
     * under both panels when neither fills the fixed height. A caller whose content changes on a pick holds the row's
     * height (`style` min-height) so the pick does not shrink it.
     */
    height: { fixed: "", fit: "" },
  },
  compoundVariants: [
    { at: "3xl", height: "fixed", className: "@3xl/panel-row:*:h-panel-aligned" },
    { at: "5xl", height: "fixed", className: "@5xl/panel-row:*:h-panel-aligned" },
    { at: "3xl", height: "fit", className: "@3xl/panel-row:*:max-h-panel-aligned" },
    { at: "5xl", height: "fit", className: "@5xl/panel-row:*:max-h-panel-aligned" },
  ],
  defaultVariants: { at: "3xl", height: "fixed" },
});

/**
 * Panels side by side that share one height: by default the fixed `--panel-aligned-height`, whatever their content,
 * so a search that empties a list or a selection with longer details never moves the page below; with
 * `height="fit"` the tallest panel's content, capped by it. Each panel scrolls its own body (`Table height="scroll"`,
 * `PanelScrollArea`). In a narrower container they stack and each grows with its content.
 */
export function PanelRow({
  at = "3xl",
  height = "fixed",
  className,
  style,
  children,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof panelRowVariants>) {
  return (
    <div data-slot="panel-row" data-height={height} className="@container/panel-row" {...props}>
      {/* `className` and `style` reach the grid of the panels: a held min-height has to be the grid's. */}
      <div className={cn(panelRowVariants({ at, height }), className)} style={style}>
        {children}
      </div>
    </div>
  );
}

/**
 * The body of a panel that scrolls once the panel has a fixed height (in a `PanelRow`): it takes the room under the
 * header, and an edge with more content past it fades (`scroll-fade-y`), so a cut reads as a scroll.
 */
export function PanelScrollArea({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="panel-scroll-area"
      className={cn(SCROLLBAR_THIN, "flex min-h-0 flex-1 scroll-fade-y flex-col overflow-y-auto", className)}
      {...props}
    />
  );
}

const PanelViewsContext = createContext<string | null>(null);

/**
 * Two or more views of one panel body (a ranked list and a plot of the same rows) behind a view switch. Every view is
 * laid out in the same cell, so the body is as tall as the tallest of them and switching never moves the page below;
 * only the view named by `value` is visible, the others are `inert`. Children are `PanelView`s.
 */
export function PanelViews({ value, className, ...props }: React.ComponentProps<"div"> & { value: string }) {
  return (
    <PanelViewsContext value={value}>
      <div data-slot="panel-views" className={cn("grid min-w-0 grid-cols-1", className)} {...props} />
    </PanelViewsContext>
  );
}

/** One view of `PanelViews`, shown while its `value` is the selected one. */
export function PanelView({ value, className, ...props }: React.ComponentProps<"div"> & { value: string }) {
  const selected = use(PanelViewsContext);
  if (selected === null) throw new Error("PanelView must be used inside PanelViews");
  const active = selected === value;
  return (
    <div
      data-slot="panel-view"
      data-state={active ? "active" : "inactive"}
      inert={!active}
      className={cn("col-start-1 row-start-1 min-w-0 data-[state=inactive]:invisible", className)}
      {...props}
    />
  );
}

const panelHeaderSizes = {
  sm: "min-h-9 px-3 py-1.5",
  default: "min-h-12 px-4 py-2",
};

export function PanelHeader({
  title,
  description,
  icon: Icon,
  size = "default",
  accent,
  as,
  className,
  style,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  title: React.ReactNode;
  /**
   * The title's heading level. By default one below the enclosing region's (h2 under the page title, h3 inside a
   * `Section`), so the outline never skips a level; set it only where the panel is titled from elsewhere.
   */
  as?: "h2" | "h3" | "h4";
  /** A quiet line beside the title: the date range, the sample size, the unit. */
  description?: React.ReactNode;
  icon?: LucideIcon;
  size?: keyof typeof panelHeaderSizes;
  /** A CSS color that identifies the panel's group: a stripe on the leading edge, and the icon takes it too. */
  accent?: string;
  /** Controls, pushed to the trailing edge. */
  children?: React.ReactNode;
}) {
  const outlineLevel = useNextHeadingLevel();
  return (
    // A minimum height, not a fixed one: a wrapped title would overflow and be cut by the card's own
    // `overflow-hidden`. `@container` lets controls inside decide what they have room for.
    <div
      data-slot="panel-header"
      style={accent ? { borderInlineStartColor: accent, ...style } : style}
      className={cn(
        "@container flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b",
        accent && "border-s-2",
        panelHeaderSizes[size],
        className,
      )}
      {...props}
    >
      {createElement(
        as ?? outlineLevel,
        { className: "flex min-w-0 items-center gap-2 text-sm font-semibold" },
        Icon && (
          <Icon
            aria-hidden="true"
            className="size-3.5 shrink-0 text-muted-foreground"
            style={accent ? { color: accent } : undefined}
          />
        ),
        <span className="truncate">{title}</span>,
      )}
      {description && (
        <Text data-slot="panel-header-description" variant="caption" tone="muted" numeric="tabular">
          {description}
        </Text>
      )}
      {children}
    </div>
  );
}

export function PanelBody({
  size = "default",
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { size?: "sm" | "default" }) {
  // The body sits under the panel's title, so a heading inside it (a group, a nested panel) is one level below it.
  const titleLevel = useNextHeadingLevel();
  return (
    <div data-slot="panel-body" className={cn("min-w-0", size === "sm" ? "px-3 py-2" : "p-4", className)} {...props}>
      <HeadingLevel level={Number(titleLevel.slice(1))}>{children}</HeadingLevel>
    </div>
  );
}

export function PanelFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="panel-footer"
      className={cn("border-t px-3 py-2 text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}

interface PanelShowMoreProps extends Omit<React.ComponentProps<typeof Button>, "children"> {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** How many rows there are when everything is shown. */
  total: number;
}

/** The last row of a panel that shows the first few rows of a longer list. */
export function PanelShowMore({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  total,
  onClick,
  className,
  ...props
}: PanelShowMoreProps) {
  const [open, setOpen] = useControllableState({
    value: openProp,
    defaultValue: defaultOpen,
    onValueChange: onOpenChange,
  });
  return (
    <Button
      data-slot="panel-show-more"
      data-state={open ? "open" : "closed"}
      variant="row"
      aria-expanded={open}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) setOpen(!open);
      }}
      className={cn("justify-center gap-1.5 py-2 text-xs text-muted-foreground hover:text-foreground", className)}
      {...props}
    >
      {open ? "Show fewer" : `Show all ${total}`}
      <ChevronDownIcon
        className={cn("size-3.5 transition-transform duration-fast ease-standard", open && "rotate-180")}
      />
    </Button>
  );
}

type PanelSectionProps = Omit<React.ComponentProps<"div">, "title"> & {
  title: React.ReactNode;
  /** Counts or controls on the trailing edge. */
  children?: React.ReactNode;
  /**
   * The title's element. `div` (the default) for a strip that only divides rows; a heading level, one below the
   * panel's title, when the groups are what a reader navigates by (the topics of a long list).
   */
  as?: "div" | "h3" | "h4";
} & (
    | {
        /** `strip`: a filled, ruled band with an uppercase label, for groups of rows that scroll or need a hard edge. */
        variant?: "strip";
        /** `subtle` is the translucent strip; `opaque` is the panel's own surface, for a strip that rows scroll under. */
        tone?: "subtle" | "opaque";
      }
    | {
        /**
         * `label`: a quiet sentence-case label set close above its group and away from the one before, so whitespace
         * does the dividing. For panels with many small groups, where a band per group turns into stripes.
         */
        variant: "label";
        tone?: never;
      }
  );

/** A titled strip that divides the rows of a panel or list into groups: "Today", "Core items". */
export function PanelSection({
  title,
  as: Title = "div",
  variant = "strip",
  tone = "subtle",
  className,
  children,
  ...props
}: PanelSectionProps) {
  if (variant === "label") {
    return (
      <div
        data-slot="panel-section"
        data-variant="label"
        className={cn(
          "flex min-w-0 items-center justify-between gap-2 px-3 pt-3 pb-1 text-xs text-muted-foreground",
          className,
        )}
        {...props}
      >
        <Title className="truncate font-semibold text-foreground">{title}</Title>
        {children}
      </div>
    );
  }
  return (
    <div
      data-slot="panel-section"
      data-tone={tone}
      className={cn(
        "flex min-w-0 items-center justify-between gap-2 border-b px-4 py-1.5 text-xs text-muted-foreground",
        tone === "opaque" ? "bg-card" : "bg-subtle",
        className,
      )}
      {...props}
    >
      <Title className="truncate eyebrow">{title}</Title>
      {children}
    </div>
  );
}
