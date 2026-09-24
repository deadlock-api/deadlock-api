import { Popover as PopoverPrimitive } from "radix-ui";
import * as React from "react";

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
      const forward = (value: HTMLButtonElement | null) => {
        if (typeof ref === "function") ref(value);
        else if (ref) ref.current = value;
      };
      forward(node);
      setTriggerId?.(node?.id || undefined);
      // A ref callback that returns a cleanup is not called again with null, so the cleanup forwards it.
      return () => {
        forward(null);
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
 * The popover is a dialog, and a dialog needs a name: pass `aria-label` or `aria-labelledby` ("Rank", "Viscous
 * details"). Without either it is named by its trigger.
 */
function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  const trigger = React.use(PopoverTriggerIdContext);
  const labelledBy = ariaLabelledBy ?? (ariaLabel == null ? trigger?.triggerId : undefined);
  return (
    <PopoverPrimitive.Portal>
      {/* A Field around the trigger labels the trigger, not the controls inside the popover. */}
      <FieldLabelContext value={null}>
        <PopoverPrimitive.Content
          data-slot="popover-content"
          align={align}
          sideOffset={sideOffset}
          aria-label={ariaLabel}
          aria-labelledby={labelledBy}
          className={cn(
            FOCUS_RING,
            POPPER_MOTION,
            POPPER_SCROLLBAR,
            "z-50 w-72 origin-(--radix-popover-content-transform-origin) rounded-md border bg-popover p-4 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
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

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
