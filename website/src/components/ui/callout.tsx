import { cva, type VariantProps } from "class-variance-authority";
import { Popover as PopoverPrimitive } from "radix-ui";
import type * as React from "react";

import { POPPER_MOTION } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

/**
 * A message pinned to a control, about what the control just did ("No player stats here"). It floats over the page,
 * so nothing moves when it opens, and it never takes focus: the visitor keeps typing in the field. It closes on
 * Escape or a click elsewhere; the owner closes it when the field changes. `open` / `onOpenChange`.
 */
function Callout(props: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="callout" modal={false} {...props} />;
}

/** What the callout points at: a wrapper around the control, or the control itself with `asChild`. */
function CalloutAnchor(props: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="callout-anchor" {...props} />;
}

const calloutVariants = cva(
  "z-50 grid w-max max-w-(--radix-popper-anchor-width) grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border-2 bg-popover px-4 py-3 text-sm text-popover-foreground shadow-lg has-[>svg]:grid-cols-[calc(var(--spacing)*5)_1fr] has-[>svg]:gap-x-3 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 [&>svg]:size-5",
  {
    variants: {
      variant: {
        info: "border-info/60 [&>svg]:text-info",
        warning: "border-warning/60 [&>svg]:text-warning",
        destructive: "border-destructive/60 [&>svg]:text-destructive",
      },
    },
    defaultVariants: { variant: "info" },
  },
);

const arrowVariants = cva(
  "relative size-3 -translate-y-1/2 rotate-45 border-e-2 border-b-2 bg-popover fill-transparent",
  {
    variants: {
      variant: { info: "border-info/60", warning: "border-warning/60", destructive: "border-destructive/60" },
    },
    defaultVariants: { variant: "info" },
  },
);

/**
 * The message, under its anchor by default, with an arrow at it. A leading icon, `CalloutTitle`, `CalloutDescription`.
 * It is announced as an alert when it opens; give the anchored control `aria-describedby` with its `id`.
 */
function CalloutContent({
  className,
  variant,
  side = "bottom",
  align = "center",
  sideOffset = 10,
  children,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content> & VariantProps<typeof calloutVariants>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="callout-content"
        role="alert"
        side={side}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={16}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        className={cn(calloutVariants({ variant }), POPPER_MOTION, className)}
        {...props}
      >
        {children}
        <PopoverPrimitive.Arrow asChild>
          <span aria-hidden="true" className={arrowVariants({ variant })} />
        </PopoverPrimitive.Arrow>
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}

function CalloutTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="callout-title" className={cn("col-start-2 font-semibold", className)} {...props} />;
}

function CalloutDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="callout-description" className={cn("col-start-2 text-muted-foreground", className)} {...props} />
  );
}

export { Callout, CalloutAnchor, CalloutContent, CalloutTitle, CalloutDescription };
