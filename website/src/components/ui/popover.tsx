import { Popover as PopoverPrimitive } from "radix-ui";
import * as React from "react";

import { assignRef } from "~/components/ui/hooks/assign-ref";
import { FieldLabelContext } from "~/components/ui/hooks/use-field-control";
import { FOCUS_RING, POPPER_MOTION, POPPER_SCROLLBAR } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

/** The id of the mounted trigger, which names the popover when it is given no name of its own. */
const PopoverTriggerIdContext = React.createContext<{
  fallbackId: string;
  triggerId: string | undefined;
  setTriggerId: (id: string | undefined) => void;
} | null>(null);

function Popover({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  const fallbackId = React.useId();
  const [triggerId, setTriggerId] = React.useState<string>();
  const context = React.useMemo(() => ({ fallbackId, triggerId, setTriggerId }), [fallbackId, triggerId]);
  return (
    <PopoverTriggerIdContext value={context}>
      <PopoverPrimitive.Root data-slot="popover" {...props} />
    </PopoverTriggerIdContext>
  );
}

function PopoverTrigger({ id, ref, ...props }: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  const context = React.use(PopoverTriggerIdContext);
  const setTriggerId = context?.setTriggerId;
  // The id is read from the node: with `asChild` the child's own id wins over the one given here.
  const trackTrigger = React.useCallback(
    (node: HTMLButtonElement | null) => {
      assignRef(ref, node);
      setTriggerId?.(node?.id || undefined);
      // A ref callback that returns a cleanup is not called again with null, so the cleanup forwards it.
      return () => {
        assignRef(ref, null);
        setTriggerId?.(undefined);
      };
    },
    [ref, setTriggerId],
  );
  return (
    <PopoverPrimitive.Trigger
      data-slot="popover-trigger"
      id={id ?? context?.fallbackId}
      ref={trackTrigger}
      {...props}
    />
  );
}

/**
 * The side of `anchor` with room for a popup of up to `reserve` px (a combobox's list at its full height): below when
 * it fits there or there is more room below than above, else above. Call it when the popup opens, in a handler, and
 * pass the result as `side` with `fit="available"`, so the popup keeps that side while its content arrives.
 */
function sideWithRoom(anchor: Element, reserve: number): "top" | "bottom" {
  const rect = anchor.getBoundingClientRect();
  const below = window.innerHeight - rect.bottom;
  return below >= reserve || below >= rect.top ? "bottom" : "top";
}

interface PopoverContentProps extends React.ComponentProps<typeof PopoverPrimitive.Content> {
  /**
   * `flip` (the default) moves the popover to the other side when it collides with the viewport. `available` keeps
   * the side it was given and caps its height at the room on that side instead, its content scrolling: for a popup
   * whose content grows while it is open (a combobox's results), which would otherwise jump from side to side. A
   * child that scrolls needs `min-h-0`.
   */
  fit?: "flip" | "available";
}

/**
 * The popover is a dialog, and a dialog needs a name: pass `aria-label` or `aria-labelledby` ("Rank", "Viscous
 * details"). Without either it is named by its trigger.
 */
function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  fit = "flip",
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  ...props
}: PopoverContentProps) {
  const trigger = React.use(PopoverTriggerIdContext);
  const labelledBy = ariaLabelledBy ?? (ariaLabel == null ? trigger?.triggerId : undefined);
  return (
    <PopoverPrimitive.Portal>
      {/* A Field around the trigger labels the trigger, not the controls inside the popover. */}
      <FieldLabelContext value={null}>
        <PopoverPrimitive.Content
          data-slot="popover-content"
          data-fit={fit}
          align={align}
          sideOffset={sideOffset}
          avoidCollisions={fit === "flip"}
          collisionPadding={fit === "available" ? 8 : undefined}
          aria-label={ariaLabel}
          aria-labelledby={labelledBy}
          className={cn(
            FOCUS_RING,
            POPPER_MOTION,
            POPPER_SCROLLBAR,
            "z-50 w-72 origin-(--radix-popover-content-transform-origin) rounded-md border bg-popover p-4 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            fit === "available" && "flex max-h-(--radix-popover-content-available-height) flex-col",
            className,
          )}
          {...props}
        />
      </FieldLabelContext>
    </PopoverPrimitive.Portal>
  );
}

function PopoverAnchor({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor, sideWithRoom };
