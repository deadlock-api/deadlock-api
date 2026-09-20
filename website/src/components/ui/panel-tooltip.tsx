import type { ComponentProps, ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

const panelTooltipClassName =
  "flex max-w-72 flex-col gap-2 rounded-md border border-border bg-popover px-3 py-2.5 text-start text-popover-foreground shadow-md";

/** The same surface for chart tooltips, which are positioned by Recharts. */
export function PanelTooltipCard({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="panel-tooltip-card" className={cn(panelTooltipClassName, className)} {...props} />;
}

/**
 * A styled hint for an existing action or a truncated label. The child is the trigger and the root: `ref`, `aria-*`,
 * `data-*` and handlers reach it. `open`, `defaultOpen` and `onOpenChange` control the hint.
 */
export function PanelTooltip({
  children,
  content,
  side = "top",
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: Omit<ComponentProps<typeof TooltipTrigger>, "content" | "asChild"> &
  Pick<ComponentProps<typeof Tooltip>, "open" | "defaultOpen" | "onOpenChange"> &
  Pick<ComponentProps<typeof TooltipContent>, "side"> & { content: ReactNode }) {
  return (
    <Tooltip open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <TooltipTrigger asChild {...props}>
        {children}
      </TooltipTrigger>
      <PanelTooltipContent side={side}>{content}</PanelTooltipContent>
    </Tooltip>
  );
}

const TOOLTIP_TARGET_DISPLAY = {
  inline: "inline",
  "inline-block": "inline-block",
  block: "block",
};

/**
 * A focusable stand-in for an element that has a hover card but no control of its own: a value in a table, a
 * truncated name. It is in the tab order and carries the one focus treatment, so the card is reachable by keyboard.
 */
export function TooltipTarget({
  display = "inline-block",
  className,
  ...props
}: ComponentProps<"span"> & {
  /**
   * How the target sits in its line. It defaults to `inline-block` so the focus ring boxes the whole trigger; an
   * `inline` target whose content wraps gets one ring fragment per line. A trigger that must fill its column — a
   * bar, a full-width row — takes `block`.
   */
  display?: keyof typeof TOOLTIP_TARGET_DISPLAY;
}) {
  // A block target may hold block content (a bar, a row), which a span may not.
  const Tag = (display === "block" ? "div" : "span") as "span";
  return (
    <Tag
      data-slot="tooltip-target"
      data-display={display}
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the span exists to make a hover card reachable by keyboard
      tabIndex={0}
      className={cn(
        "cursor-default rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        TOOLTIP_TARGET_DISPLAY[display],
        className,
      )}
      {...props}
    />
  );
}

/** The popover-styled hover card the other pages' tables use, in place of the primitive's inverted default. */
export function PanelTooltipContent({ className, ...props }: ComponentProps<typeof TooltipContent>) {
  return (
    <TooltipContent
      data-slot="panel-tooltip-content"
      className={cn(
        panelTooltipClassName,
        // The primitive's arrow is a solid inverted diamond. Here it continues the card: same fill, and the card's
        // border carried around its two outward edges, so it does not read as a black blob on a dark page.
        "[&>span>svg]:border-e [&>span>svg]:border-b [&>span>svg]:border-border [&>span>svg]:bg-popover [&>span>svg]:fill-popover",
        className,
      )}
      {...props}
    />
  );
}

/** What the hover card is about: a name, an optional supporting line, and an optional leading image or icon. */
export function TooltipHeader({
  lead,
  title,
  subtitle,
  className,
  ...props
}: Omit<ComponentProps<"div">, "title" | "children"> & { lead?: ReactNode; title: ReactNode; subtitle?: ReactNode }) {
  return (
    <div data-slot="tooltip-header" className={cn("flex items-center gap-2", className)} {...props}>
      {lead}
      <div className="min-w-0 leading-tight">
        <div className="text-sm font-semibold">{title}</div>
        {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
      </div>
    </div>
  );
}

/** Label and value pairs under a header, the values sharing one end-aligned column so the numbers line up. */
export function TooltipStats({
  variant = "divided",
  className,
  ...props
}: ComponentProps<"div"> & {
  /** `divided` rules the stats off from the header above them; `plain` when they are the whole body. */
  variant?: "divided" | "plain";
}) {
  return (
    <div
      data-slot="tooltip-stats"
      data-variant={variant}
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-1 text-xs",
        variant === "divided" && "border-t border-border pt-2",
        className,
      )}
      {...props}
    />
  );
}

const TOOLTIP_STAT_TONE = {
  default: "",
  muted: "text-muted-foreground",
  primary: "text-primary",
  positive: "text-positive",
  negative: "text-negative",
  warning: "text-warning",
  info: "text-info",
};

/**
 * One label and value of TooltipStats. The root has `display: contents`, so its two cells sit in the parent's grid;
 * it draws no box, which is why `className` styles the value cell.
 */
export function TooltipStat({
  label,
  value,
  tone = "default",
  className,
  ...props
}: Omit<ComponentProps<"div">, "children"> & {
  label: ReactNode;
  value: ReactNode;
  tone?: keyof typeof TOOLTIP_STAT_TONE;
}) {
  return (
    <div data-slot="tooltip-stat" className="contents" {...props}>
      <span data-slot="tooltip-stat-label" className="min-w-0 break-words text-muted-foreground">
        {label}
      </span>
      <span
        data-slot="tooltip-stat-value"
        className={cn("text-end font-medium tabular-nums", TOOLTIP_STAT_TONE[tone], className)}
      >
        {value}
      </span>
    </div>
  );
}
