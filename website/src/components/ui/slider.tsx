import { Slider as SliderPrimitive } from "radix-ui";
import * as React from "react";

import { FOCUS_RING_BORDER } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  "aria-label": ariaLabel,
  thumbLabels,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root> & {
  /** One name per thumb of a range slider: `["Minimum rank", "Maximum rank"]`. */
  thumbLabels?: readonly string[];
}) {
  const values = React.useMemo(
    () => (Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min, max]),
    [value, defaultValue, min, max],
  );

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        "relative flex w-full touch-none items-center select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className={cn(
          "relative grow overflow-hidden rounded-full bg-muted data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5",
        )}
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className={cn("absolute bg-primary data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full")}
        />
      </SliderPrimitive.Track>
      {Array.from({ length: values.length }, (_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          // Radix puts role="slider" on the thumb, so a label on the root never reaches assistive technology.
          aria-label={thumbLabels?.[index] ?? ariaLabel}
          // Radix marks a disabled thumb with `data-disabled`, not the `:disabled` of a form control.
          className={cn(
            FOCUS_RING_BORDER,
            "relative block size-4 shrink-0 rounded-full border border-primary bg-primary-foreground shadow-sm ring-ring/50 transition-[color,box-shadow] after:absolute after:-inset-1 hover:ring-4 data-[disabled]:cursor-not-allowed data-[disabled]:hover:ring-0",
          )}
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export { Slider };
