import * as React from "react";

import { useFieldControlProps } from "~/components/ui/hooks/use-field-control";
import { CONTROL_SURFACE, DISABLED_STATE, FOCUS_RING_BORDER, INVALID_STATE, READ_ONLY } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

// Chrome and Firefox draw their own stepper inside a number field. `hidden` removes it for a field that has its own
// stepper buttons beside it; the keyboard arrows keep working either way.
const NO_SPINNERS =
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

function Input({
  className,
  type,
  size = "default",
  spinners = "native",
  ...props
}: Omit<React.ComponentProps<"input">, "size"> & {
  size?: "default" | "sm";
  /** Only meaningful for `type="number"`: whether the browser's own stepper is drawn. */
  spinners?: "native" | "hidden";
}) {
  const fieldProps = useFieldControlProps(props);
  return (
    <input
      type={type}
      data-slot="input"
      data-size={size}
      data-spinners={spinners}
      className={cn(
        DISABLED_STATE,
        CONTROL_SURFACE,
        "h-9 w-full min-w-0 px-3 py-1 selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground hover:border-muted-foreground",
        // iOS zooms the page when a focused field is under 16px. That is about touch, not about the viewport width.
        "pointer-coarse:text-base",
        READ_ONLY,
        FOCUS_RING_BORDER,
        INVALID_STATE,
        // As plain classes, not `data-[size=sm]:` variants: a variant outranks a caller's `ps-7`, which would push a
        // leading icon under the text.
        size === "sm" && "h-8 px-2.5",
        spinners === "hidden" && NO_SPINNERS,
        // A swatch that opens the native picker; its value is always a hex string.
        type === "color" && "w-14 cursor-pointer bg-transparent p-1",
        className,
      )}
      {...props}
      {...fieldProps}
    />
  );
}

export { Input };
