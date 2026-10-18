import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "~/lib/utils";

/**
 * A bar that floats over the page while a mode is on (picking an element, a bulk selection): centred on the inline
 * axis without a physical translate, so it holds in RTL; as wide as its content up to a readable measure, and it wraps
 * on a narrow screen instead of running off it.
 */
const floatingBarVariants = cva(
  "fixed inset-x-4 mx-auto flex w-fit max-w-xl flex-wrap items-center justify-center gap-x-3 gap-y-1.5 rounded-lg border bg-popover/90 px-4 py-2 text-sm text-popover-foreground shadow-lg backdrop-blur-md",
  {
    variants: {
      position: { top: "top-4", bottom: "bottom-4" },
    },
    defaultVariants: { position: "top" },
  },
);

interface FloatingBarProps extends React.ComponentProps<"div">, VariantProps<typeof floatingBarVariants> {}

/** Name it (`aria-label` or `aria-labelledby`) when it holds controls; a status inside it says what the mode is doing. */
export function FloatingBar({ position = "top", className, ...props }: FloatingBarProps) {
  return (
    <div
      data-slot="floating-bar"
      data-position={position}
      className={cn(floatingBarVariants({ position }), className)}
      {...props}
    />
  );
}
