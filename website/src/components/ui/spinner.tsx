import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "~/lib/utils";

const spinnerVariants = cva("animate-spin", {
  variants: {
    size: {
      xs: "size-3",
      sm: "size-3.5",
      default: "size-4",
      lg: "size-5",
    },
  },
  defaultVariants: { size: "default" },
});

/** An inline busy indicator for a control or a line of text. A whole region that is loading uses LoadingState instead. */
export function Spinner({
  size = "default",
  className,
  label = "Loading",
  ...props
}: React.ComponentProps<"output"> & VariantProps<typeof spinnerVariants> & { label?: string }) {
  return (
    <output
      data-slot="spinner"
      data-size={size}
      aria-label={label}
      className={cn("inline-flex shrink-0", className)}
      {...props}
    >
      <Loader2 aria-hidden="true" className={spinnerVariants({ size })} />
    </output>
  );
}
