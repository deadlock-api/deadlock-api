import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";

import { cn } from "~/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
}

interface SegmentedProps<T extends string> {
  value: T | "";
  onValueChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  className?: string;
}

export function Segmented<T extends string>({ value, onValueChange, options, className }: SegmentedProps<T>) {
  return (
    <ToggleGroupPrimitive.Root
      type="single"
      value={value}
      // Radix reports "" when the active item is clicked again; a segmented control has no empty state.
      onValueChange={(next) => next && onValueChange(next as T)}
      className={cn("flex w-full flex-wrap gap-0.5 rounded-lg border bg-secondary p-0.5", className)}
    >
      {options.map((option) => (
        <ToggleGroupPrimitive.Item
          key={option.value}
          value={option.value}
          className={cn(
            "flex-1 cursor-pointer rounded-md font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none",
            "hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
            "data-[state=on]:bg-primary/15 data-[state=on]:text-foreground data-[state=on]:ring-1 data-[state=on]:ring-primary/40 data-[state=on]:ring-inset",
            "h-7 px-2.5 text-xs",
          )}
        >
          {option.label}
        </ToggleGroupPrimitive.Item>
      ))}
    </ToggleGroupPrimitive.Root>
  );
}
