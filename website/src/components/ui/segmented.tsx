import { cva, type VariantProps } from "class-variance-authority";
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import { createContext, use } from "react";

import { useControllableState } from "~/components/ui/hooks/use-controllable-state";
import { cn } from "~/lib/utils";

const segmentedItemVariants = cva(
  [
    "inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap text-muted-foreground transition-colors",
    "outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
    "data-[state=on]:bg-primary/15 data-[state=on]:text-foreground data-[state=on]:ring-1 data-[state=on]:ring-primary/40 data-[state=on]:ring-inset",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  ],
  {
    variants: {
      size: {
        sm: "h-6 px-2 text-2xs",
        default: "h-7 px-2.5 text-xs",
        lg: "h-8 px-3 text-sm",
      },
    },
    defaultVariants: { size: "default" },
  },
);

type SegmentedSize = NonNullable<VariantProps<typeof segmentedItemVariants>["size"]>;

const SegmentedSizeContext = createContext<SegmentedSize>("default");

interface SegmentedProps<T extends string> extends Omit<
  React.ComponentProps<typeof ToggleGroupPrimitive.Root>,
  "type" | "value" | "defaultValue" | "onValueChange"
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
      <ToggleGroupPrimitive.Root
        data-slot="segmented"
        data-size={size}
        data-width={width}
        {...props}
        type="single"
        value={current}
        // Radix reports "" when the active item is clicked again; a segmented control has no empty state.
        onValueChange={(next) => next && setCurrent(next as T)}
        className={cn(
          "flex-wrap gap-0.5 rounded-lg border bg-secondary p-0.5",
          width === "fill" ? "flex w-full" : "inline-flex w-fit",
          className,
        )}
      >
        {children}
      </ToggleGroupPrimitive.Root>
    </SegmentedSizeContext>
  );
}

/** One option. An icon-only item needs an `aria-label`. */
function SegmentedItem({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  const size = use(SegmentedSizeContext);
  return (
    <ToggleGroupPrimitive.Item
      data-slot="segmented-item"
      className={cn(segmentedItemVariants({ size }), className)}
      {...props}
    />
  );
}

export { Segmented, SegmentedItem };
