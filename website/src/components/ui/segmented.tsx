import { cva, type VariantProps } from "class-variance-authority";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { createContext, use } from "react";

import { useControllableState } from "~/components/ui/hooks/use-controllable-state";
import { DISABLED_STATE, FOCUS_RING, SELECTED_STATE } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

const segmentedItemVariants = cva(
  [
    "inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap text-muted-foreground transition-colors",
    FOCUS_RING,
    DISABLED_STATE,
    "hover:bg-accent hover:text-foreground",
    SELECTED_STATE,
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  ],
  {
    variants: {
      size: {
        // At least square, so a one-character item such as "5" is still a 24px target.
        sm: "h-6 min-w-6 px-2 text-2xs",
        default: "h-7 min-w-7 px-2.5 text-xs",
        lg: "h-8 min-w-8 px-3 text-sm",
      },
    },
    defaultVariants: { size: "default" },
  },
);

type SegmentedSize = NonNullable<VariantProps<typeof segmentedItemVariants>["size"]>;

const SegmentedSizeContext = createContext<SegmentedSize>("default");

interface SegmentedProps<T extends string> extends Omit<
  React.ComponentProps<typeof RadioGroupPrimitive.Root>,
  "value" | "defaultValue" | "onValueChange"
> {
  value?: T | "";
  defaultValue?: T;
  onValueChange?: (value: T) => void;
  size?: SegmentedSize;
  /** `fill` stretches to the container and shares its width between the items; `hug` is as wide as its labels. */
  width?: "fill" | "hug";
}

/**
 * A single choice from a few short options, all visible at once; the children are `SegmentedItem`s. For on/off
 * toggles of independent items use ToggleGroup.
 *
 * It is a WAI-ARIA radio group: Tab lands on the chosen item, and the arrow keys move and choose at once.
 */
function Segmented<T extends string>({
  value,
  defaultValue,
  onValueChange,
  size = "default",
  width = "fill",
  className,
  children,
  ...props
}: SegmentedProps<T>) {
  const [current, setCurrent] = useControllableState<T | "">({
    value,
    defaultValue: defaultValue ?? "",
    onValueChange: onValueChange as ((next: T | "") => void) | undefined,
  });
  return (
    <SegmentedSizeContext value={size}>
      <RadioGroupPrimitive.Root
        data-slot="segmented"
        data-size={size}
        data-width={width}
        {...props}
        value={current}
        onValueChange={(next) => setCurrent(next as T)}
        className={cn(
          "flex-wrap gap-0.5 rounded-lg border bg-secondary p-0.5",
          width === "fill" ? "flex w-full" : "inline-flex w-fit",
          className,
        )}
      >
        {children}
      </RadioGroupPrimitive.Root>
    </SegmentedSizeContext>
  );
}

/** One option. An icon-only item needs an `aria-label`. */
function SegmentedItem({ className, ...props }: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  const size = use(SegmentedSizeContext);
  return (
    <RadioGroupPrimitive.Item
      data-slot="segmented-item"
      className={cn(segmentedItemVariants({ size }), className)}
      {...props}
    />
  );
}

export { Segmented, SegmentedItem };
