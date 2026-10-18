import { HoverCard as HoverCardPrimitive, Tooltip as TooltipPrimitive } from "radix-ui";
import { type ComponentProps, createContext, type ReactNode, use, useRef } from "react";

import { useControllableState } from "~/components/ui/hooks/use-controllable-state";
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

/**
 * The tooltip surface for chart tooltips, which are positioned by Recharts. A polite live region: the arrow keys move
 * a chart's reading (Recharts' accessibility layer), and each new reading is read out, as Recharts' own tooltip does.
 */
function TooltipCard({ className, ...props }: ComponentProps<"output">) {
  // An <output> is a polite status region (role="status") by itself.
  return (
    <output data-slot="tooltip-card" aria-atomic="true" className={cn(tooltipSurfaceClassName, className)} {...props} />
  );
}

/** Closes the card a click pinned open, if any: one pinned card at a time, and a card opening elsewhere closes it. */
let pinnedCard: { owner: object; close: () => void } | null = null;

function closeOtherPinned(owner: object) {
  if (pinnedCard && pinnedCard.owner !== owner) pinnedCard.close();
}

/**
 * What makes a trigger a toggletip: a press toggles the card, so a tap opens it on a touch screen, where hover never
 * happens. The trigger becomes a button (`role`, `aria-expanded`; Enter and Space on a non-native one), which also
 * makes an `aria-label` on a `TooltipTarget` span a valid name.
 *
 * A mouse click pins the card: hover opens it on the way to the click, and a click that closed it again read as a dead
 * click. A pinned card stays open when the pointer leaves, and closes on a second click, Escape, a press outside it,
 * or another card opening. `onOpenChange` and `contentProps` go to the Radix root and content; `owner` names the card.
 */
function useToggleTrigger(open: boolean, setOpen: (open: boolean) => void) {
  // Whether the card was open, and pinned, when the press began: hover or focus may open it on the way to the click.
  const openAtPress = useRef(false);
  const pinnedAtPress = useRef(false);
  // A touch press toggles on pointer up: a hover card cancels the touch's click.
  const touchHandled = useRef(false);
  const pinned = useRef(false);
  const triggerElement = useRef<Element | null>(null);
  const unpin = () => {
    pinned.current = false;
    if (pinnedCard?.owner === pinned) pinnedCard = null;
  };
  const close = () => {
    unpin();
    setOpen(false);
  };
  const pin = () => {
    closeOtherPinned(pinned);
    pinned.current = true;
    pinnedCard = { owner: pinned, close };
    setOpen(true);
  };
  return {
    owner: pinned,
    triggerProps: {
      role: "button",
      "aria-expanded": open,
      // Default prevented, so Radix does not close the card on the press, and the press does not move focus.
      onPointerDown: (event: React.PointerEvent) => {
        triggerElement.current = event.currentTarget;
        openAtPress.current = open;
        pinnedAtPress.current = pinned.current;
        touchHandled.current = false;
        event.preventDefault();
      },
      onPointerUp: (event: React.PointerEvent) => {
        if (event.pointerType !== "touch") return;
        touchHandled.current = true;
        if (openAtPress.current) close();
        else setOpen(true);
      },
      onClick: (event: React.MouseEvent) => {
        event.preventDefault();
        if (touchHandled.current) {
          touchHandled.current = false;
          return;
        }
        // `detail` is 0 for a click from the keyboard (Enter or Space on a native button), which toggles.
        if (event.detail === 0) {
          if (open) close();
          else setOpen(true);
        } else if (pinnedAtPress.current) close();
        else pin();
      },
      onKeyDown: (event: React.KeyboardEvent) => {
        if (event.currentTarget instanceof HTMLButtonElement) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        if (open) close();
        else setOpen(true);
      },
    },
    // Radix asks to close when the pointer leaves or another tooltip opens: a pinned card stays.
    onOpenChange: (next: boolean) => {
      if (!next && pinned.current) return;
      setOpen(next);
    },
    contentProps: {
      onEscapeKeyDown: unpin,
      onPointerDownOutside: (event: CustomEvent<{ originalEvent: PointerEvent }>) => {
        // A press on the trigger is the trigger's own: its click closes a pinned card.
        const target = event.detail.originalEvent.target;
        if (!(target instanceof Node && triggerElement.current?.contains(target))) unpin();
      },
    },
  } as const;
}

// Set by Tooltip: whether it has no content. A TooltipTarget under an empty Tooltip (content still loading) leaves the
// tab order, so it is never a focus stop that opens nothing.
const TooltipEmptyContext = createContext(false);

/**
 * The one hover surface: a hint for an action, the details behind a value, a preview. The child is the trigger and
 * the root: `ref`, `aria-*`, `data-*` and handlers reach it. `open`, `defaultOpen` and `onOpenChange` control it.
 * Empty `content` (`null`, `false`) leaves the trigger without a tooltip. `trigger="toggle"` makes it a toggletip:
 * hover and focus still open it, and a click or a tap toggles it, so the card is reachable on a touch screen.
 */
function Tooltip({
  children,
  content,
  variant = "hint",
  trigger = "hover",
  side = "top",
  align = "center",
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  ...props
}: Omit<ComponentProps<typeof TooltipPrimitive.Trigger>, "content" | "asChild"> &
  Pick<ComponentProps<typeof TooltipPrimitive.Root>, "open" | "defaultOpen" | "onOpenChange"> &
  Pick<ComponentProps<typeof TooltipPrimitive.Content>, "side" | "align"> & {
    content: ReactNode;
    /**
     * `hint` describes the trigger to assistive technology, so its content is read as text. `preview` is for content
     * that is heavy or fetches on open (a chart): it renders once, opens after a short delay and is not announced.
     * Its content is read-only: it is out of the tab order and a tap never opens it, so it may not hold a control.
     * Content with controls is a `Popover`.
     */
    variant?: "hint" | "preview";
    /**
     * `hover`: hover and focus open it. `toggle`: a press toggles it too, and the trigger is a button that reports
     * `aria-expanded`. Use `toggle` where the card holds what a touch reader needs (a value's numbers, a note).
     */
    trigger?: "hover" | "toggle";
  }) {
  const empty = content == null || content === false;
  const [open, setOpen] = useControllableState({
    value: openProp,
    defaultValue: defaultOpen,
    onValueChange: onOpenChange,
  });
  const toggle = useToggleTrigger(open, setOpen);
  const toggles = trigger === "toggle" && !empty;
  const triggerProps = toggles ? { ...props, ...toggle.triggerProps } : props;
  const onRootOpenChange = (next: boolean) => {
    if (next) closeOtherPinned(toggle.owner);
    if (toggles) toggle.onOpenChange(next);
    else setOpen(next);
  };
  const contentProps = toggles ? toggle.contentProps : undefined;
  if (variant === "preview") {
    return (
      <TooltipEmptyContext value={empty}>
        <HoverCardPrimitive.Root openDelay={150} closeDelay={100} open={open} onOpenChange={onRootOpenChange}>
          {/* Radix types this trigger as an anchor; with `asChild` the props land on the child, whatever it is. */}
          <HoverCardPrimitive.Trigger
            data-slot="tooltip-trigger"
            asChild
            {...(triggerProps as ComponentProps<typeof HoverCardPrimitive.Trigger>)}
          >
            {children}
          </HoverCardPrimitive.Trigger>
          {!empty && (
            <HoverCardPrimitive.Portal>
              <HoverCardPrimitive.Content
                {...contentProps}
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
      </TooltipEmptyContext>
    );
  }
  return (
    <TooltipEmptyContext value={empty}>
      <TooltipPrimitive.Root data-slot="tooltip" open={open} onOpenChange={onRootOpenChange}>
        <TooltipPrimitive.Trigger data-slot="tooltip-trigger" asChild {...triggerProps}>
          {children}
        </TooltipPrimitive.Trigger>
        {!empty && (
          <TooltipPrimitive.Portal>
            <TooltipPrimitive.Content
              {...contentProps}
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
    </TooltipEmptyContext>
  );
}

const TOOLTIP_TARGET_DISPLAY = {
  "inline-block": "inline-block",
  block: "block",
};

/**
 * A focusable stand-in for an element that has a hover card but no control of its own: a value in a table, a
 * truncated name. It is in the tab order and carries the one focus treatment, so the card is reachable by keyboard.
 * While its Tooltip has no content (still loading), it leaves the tab order: no focus stop that opens nothing.
 */
const TOOLTIP_TARGET_SIZE = {
  default: "",
  /** A row of a list (a label, a meter and values): at least 24px tall, the smallest target (Law 18). */
  row: "min-h-6",
};

function TooltipTarget({
  display = "inline-block",
  underline = "none",
  size = "default",
  className,
  ...props
}: ComponentProps<"span"> & {
  size?: keyof typeof TOOLTIP_TARGET_SIZE;
  /**
   * `dashed`: the mark of a value with a hover card behind it (a plot, more numbers). Dashed, not the dotted rule of a
   * link that opens details, which a 1px dot line made too faint to find on a number.
   */
  underline?: "none" | "dashed";
  /**
   * How the target sits in its line. `inline-block` lets the focus ring box the whole trigger. A trigger that must
   * fill its column — a bar, a full-width row — takes `block`.
   */
  display?: keyof typeof TOOLTIP_TARGET_DISPLAY;
}) {
  // A block target may hold block content (a bar, a row), which a span may not.
  const Tag = (display === "block" ? "div" : "span") as "span";
  const empty = use(TooltipEmptyContext);
  return (
    <Tag
      data-slot="tooltip-target"
      data-display={display}
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the span exists to make a hover card reachable by keyboard
      tabIndex={empty ? undefined : 0}
      className={cn(
        FOCUS_RING,
        // The trigger of a toggletip is a button (`role` from `Tooltip trigger="toggle"`), and points like one.
        "cursor-default rounded-sm [&[role=button]]:cursor-pointer",
        TOOLTIP_TARGET_DISPLAY[display],
        TOOLTIP_TARGET_SIZE[size],
        underline === "dashed" &&
          "underline decoration-muted-foreground decoration-dashed underline-offset-2 hover:decoration-current hover:decoration-solid focus-visible:decoration-current focus-visible:decoration-solid",
        className,
      )}
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
