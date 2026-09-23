import { Popover as PopoverPrimitive } from "radix-ui";
import * as React from "react";

import { FieldLabelContext } from "~/components/ui/hooks/use-field-control";
import { FOCUS_RING, POPPER_MOTION } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

function Popover({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      {/* A Field around the trigger labels the trigger, not the controls inside the popover. */}
      <FieldLabelContext value={null}>
        <PopoverPrimitive.Content
          data-slot="popover-content"
          align={align}
          sideOffset={sideOffset}
          className={cn(
            FOCUS_RING,
            POPPER_MOTION,
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
