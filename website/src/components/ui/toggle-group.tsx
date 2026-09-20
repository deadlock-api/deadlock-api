"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import * as React from "react";

import { DISABLED_STATE, FOCUS_RING_BORDER, INVALID_STATE, SVG_SLOT } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

const toggleVariants = cva(
  [
    FOCUS_RING_BORDER,
    INVALID_STATE,
    DISABLED_STATE,
    SVG_SLOT,
    "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-[color,box-shadow] hover:bg-muted hover:text-muted-foreground data-[state=on]:bg-primary/15 data-[state=on]:text-foreground data-[state=on]:ring-1 data-[state=on]:ring-primary/40 data-[state=on]:ring-inset",
  ],
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline: "border border-input bg-transparent shadow-xs hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        default: "h-9 min-w-9 px-2",
        sm: "h-8 min-w-8 px-1.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

const ToggleGroupContext = React.createContext<
  VariantProps<typeof toggleVariants> & {
    spacing?: number;
  }
>({
  size: "default",
  variant: "default",
  spacing: 0,
});

function ToggleGroup({
  className,
  variant = "default",
  size = "default",
  spacing = 0,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> &
  VariantProps<typeof toggleVariants> & {
    spacing?: number;
  }) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      data-spacing={spacing}
      style={{ "--gap": spacing } as React.CSSProperties}
      className={cn("group/toggle-group flex w-fit items-center gap-[--spacing(var(--gap))] rounded-md", className)}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size, spacing }}>{children}</ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  );
}

function ToggleGroupItem({ className, children, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  const context = React.useContext(ToggleGroupContext);

  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      data-variant={context.variant}
      data-size={context.size}
      data-spacing={context.spacing}
      className={cn(
        toggleVariants({
          variant: context.variant,
          size: context.size,
        }),
        "w-auto min-w-0 shrink-0 px-3 focus:z-10 focus-visible:z-10",
        // Joined items share their borders. Plain classes, so one class from a caller still wins.
        context.spacing === 0 && "rounded-none shadow-none first:rounded-s-md last:rounded-e-md",
        context.spacing === 0 && context.variant === "outline" && "border-s-0 first:border-s",
        className,
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  );
}

export { ToggleGroup, ToggleGroupItem };
