import { cva, type VariantProps } from "class-variance-authority";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { createContext, use } from "react";

import { useControllableState } from "~/components/ui/hooks/use-controllable-state";
import { FieldLabelContext } from "~/components/ui/hooks/use-field-control";
import { DISABLED_STATE, FOCUS_RING, SELECTED_STATE } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

const segmentedItemVariants = cva(
  [
    // Equal shares of the row while the labels fit; never narrower than its label, so a row that runs out of room
    // wraps (the group is `flex-wrap`) instead of drawing "North America" over "South America".
    "inline-flex min-w-fit grow cursor-pointer items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap text-muted-foreground transition-colors",
    FOCUS_RING,
    DISABLED_STATE,
    "hover:bg-accent hover:text-foreground",
    SELECTED_STATE,
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  ],
  {
    variants: {
      size: {
        // The basis is the equal share's starting point and keeps an item at least square, so a one-character item
        // such as "5" is still a 24px target; a hugging group, which drops the basis, sets a square minimum instead
        // (HUG_FLOOR). Not here: a fixed minimum would replace `min-w-fit` and let labels draw over each other.
        // 12px at every size: the site sets no text smaller.
        sm: "h-6 basis-6 px-2 text-xs",
        default: "h-7 basis-7 px-2.5 text-xs",
        lg: "h-8 basis-8 px-3 text-sm",
      },
    },
    defaultVariants: { size: "default" },
  },
);

type SegmentedSize = NonNullable<VariantProps<typeof segmentedItemVariants>["size"]>;

/** A hugging group's items are as wide as their labels, but never narrower than they are high. */
const HUG_FLOOR: Record<SegmentedSize, string> = {
  sm: "*:data-[slot=segmented-item]:min-w-6",
  default: "*:data-[slot=segmented-item]:min-w-7",
  lg: "*:data-[slot=segmented-item]:min-w-8",
};

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
 * It is a WAI-ARIA radio group: Tab lands on the chosen item, and the arrow keys move and choose at once. The group
 * needs a name: inside a `Field` it takes the Field's label; anywhere else pass `aria-label` (or `aria-labelledby`).
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
  // Inside a Field the group is named by the Field's label, unless it brings a name of its own.
  const fieldLabel = use(FieldLabelContext);
  const labelledBy = props["aria-label"] || props["aria-labelledby"] ? undefined : (fieldLabel ?? undefined);
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
        aria-labelledby={labelledBy}
        {...props}
        value={current}
        onValueChange={(next) => setCurrent(next as T)}
        className={cn(
          "flex-wrap gap-0.5 rounded-lg border bg-secondary p-0.5",
          // Small, it stands as high as the other small controls (Input, Select, a toolbar FilterCell: 32px) so a
          // toolbar of them lines up; its items stay 24px, centred.
          size === "sm" && "min-h-8 items-center",
          // A hugging group sizes from its labels: with the items' square flex-basis as their width, "2 3 4 5 6" came
          // out too narrow and wrapped "6" below with room to spare. The row around it wraps whole controls instead.
          width === "fill"
            ? "flex w-full"
            : cn("inline-flex w-fit shrink-0 *:data-[slot=segmented-item]:basis-auto", HUG_FLOOR[size]),
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
