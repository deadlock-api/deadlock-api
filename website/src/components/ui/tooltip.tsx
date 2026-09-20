import { HoverCard as HoverCardPrimitive, Tooltip as TooltipPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";

import { FOCUS_RING, POPPER_MOTION } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

function TooltipProvider({ delayDuration = 0, ...props }: ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider data-slot="tooltip-provider" delayDuration={delayDuration} {...props} />;
}

const tooltipSurfaceClassName =
  "flex max-w-72 flex-col gap-2 rounded-md border border-border bg-popover px-3 py-2.5 text-start text-popover-foreground shadow-md";

const tooltipContentClassName = cn(
  tooltipSurfaceClassName,
  POPPER_MOTION,
  "z-50 w-fit animate-in text-xs text-balance fade-in-0 zoom-in-95",
);

const tooltipArrowClassName =
  "relative bottom-0.5 z-50 size-2.5 -translate-y-1/2 rotate-45 rounded-xs bg-foreground fill-foreground";

/** The tooltip surface for chart tooltips, which are positioned by Recharts. */
function TooltipCard({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="tooltip-card" className={cn(tooltipSurfaceClassName, className)} {...props} />;
}

/**
 * The one hover surface: a hint for an action, the details behind a value, a preview. The child is the trigger and
 * the root: `ref`, `aria-*`, `data-*` and handlers reach it. `open`, `defaultOpen` and `onOpenChange` control it.
 * Empty `content` (`null`, `false`) leaves the trigger without a tooltip.
 */
function Tooltip({
  children,
  content,
  variant = "hint",
  side = "top",
  align = "center",
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: Omit<ComponentProps<typeof TooltipPrimitive.Trigger>, "content" | "asChild"> &
  Pick<ComponentProps<typeof TooltipPrimitive.Root>, "open" | "defaultOpen" | "onOpenChange"> &
  Pick<ComponentProps<typeof TooltipPrimitive.Content>, "side" | "align"> & {
    content: ReactNode;
    /**
     * `hint` describes the trigger to assistive technology, so its content is read as text. `preview` is for content
     * that is heavy or fetches on open (a chart): it renders once, opens after a short delay and is not announced.
     */
    variant?: "hint" | "preview";
  }) {
  const empty = content == null || content === false;
  if (variant === "preview") {
    return (
      <HoverCardPrimitive.Root
        openDelay={150}
        closeDelay={100}
        open={open}
        defaultOpen={defaultOpen}
        onOpenChange={onOpenChange}
      >
        {/* Radix types this trigger as an anchor; with `asChild` the props land on the child, whatever it is. */}
        <HoverCardPrimitive.Trigger
          data-slot="tooltip-trigger"
          asChild
          {...(props as ComponentProps<typeof HoverCardPrimitive.Trigger>)}
        >
          {children}
        </HoverCardPrimitive.Trigger>
        {!empty && (
          <HoverCardPrimitive.Portal>
            <HoverCardPrimitive.Content
              data-slot="tooltip-content"
              data-variant={variant}
              side={side}
              align={align}
              collisionPadding={16}
              className={cn(
                tooltipContentClassName,
                "w-112 max-w-(--radix-hover-card-content-available-width) origin-(--radix-hover-card-content-transform-origin)",
              )}
            >
              {content}
              <HoverCardPrimitive.Arrow className={tooltipArrowClassName} />
            </HoverCardPrimitive.Content>
          </HoverCardPrimitive.Portal>
        )}
      </HoverCardPrimitive.Root>
    );
  }
  return (
    <TooltipPrimitive.Root data-slot="tooltip" open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <TooltipPrimitive.Trigger data-slot="tooltip-trigger" asChild {...props}>
        {children}
      </TooltipPrimitive.Trigger>
      {!empty && (
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            data-slot="tooltip-content"
            data-variant={variant}
            side={side}
            align={align}
            className={cn(tooltipContentClassName, "origin-(--radix-tooltip-content-transform-origin)")}
          >
            {content}
            <TooltipPrimitive.Arrow className={tooltipArrowClassName} />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      )}
    </TooltipPrimitive.Root>
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
function TooltipTarget({
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
      className={cn(FOCUS_RING, "cursor-default rounded-sm", TOOLTIP_TARGET_DISPLAY[display], className)}
      {...props}
    />
  );
}

/** What the hover card is about: a name, an optional supporting line, and an optional leading image or icon. */
function TooltipHeader({
  leading,
  title,
  subtitle,
  className,
  ...props
}: Omit<ComponentProps<"div">, "title" | "children"> & {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <div data-slot="tooltip-header" className={cn("flex items-center gap-2", className)} {...props}>
      {leading}
      <div className="min-w-0 leading-tight">
        <div className="text-sm font-semibold">{title}</div>
        {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
      </div>
    </div>
  );
}

/** Label and value pairs under a header, the values sharing one end-aligned column so the numbers line up. */
function TooltipStats({
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

/**
 * One label and value of TooltipStats. The root has `display: contents`, so its two cells sit in the parent's grid;
 * it draws no box, which is why `className` styles the value cell.
 */
function TooltipStat({
  label,
  value,
  className,
  ...props
}: Omit<ComponentProps<"div">, "children"> & {
  label: ReactNode;
  value: ReactNode;
}) {
  return (
    <div data-slot="tooltip-stat" className="contents" {...props}>
      <span data-slot="tooltip-stat-label" className="min-w-0 break-words text-muted-foreground">
        {label}
      </span>
      <span data-slot="tooltip-stat-value" className={cn("text-end font-medium tabular-nums", className)}>
        {value}
      </span>
    </div>
  );
}

export { Tooltip, TooltipCard, TooltipHeader, TooltipProvider, TooltipStat, TooltipStats, TooltipTarget };
