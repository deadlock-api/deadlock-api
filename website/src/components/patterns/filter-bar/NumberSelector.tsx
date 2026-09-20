import { MinusIcon, PlusIcon } from "lucide-react";

import { FilterCell, type FilterCellPassthroughProps } from "~/components/patterns/filter-bar/FilterCell";
import { Button } from "~/components/ui/button";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { cn } from "~/lib/utils";

interface NumberSelectorBareProps extends Omit<React.ComponentProps<"div">, "onChange" | "children"> {
  value: number;
  onValueChange?: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
}

/** A stepper: the value between a minus and a plus button. */
function NumberSelectorBare({
  value,
  onValueChange,
  step = 1,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  disabled = false,
  className,
  ...props
}: NumberSelectorBareProps) {
  return (
    <div
      data-slot="number-selector"
      data-disabled={disabled || undefined}
      className={cn(
        "flex h-9 w-full min-w-0 items-center rounded-md border bg-transparent p-1 text-sm focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
        className,
      )}
      {...props}
    >
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Decrease"
        className="text-muted-foreground"
        disabled={disabled || value <= min}
        onClick={() => onValueChange?.(Math.max(min, value - step))}
      >
        <MinusIcon />
      </Button>
      <output className="min-w-8 flex-1 text-center text-muted-foreground tabular-nums select-none">{value}</output>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Increase"
        className="text-muted-foreground"
        disabled={disabled || value >= max}
        onClick={() => onValueChange?.(Math.min(max, value + step))}
      >
        <PlusIcon />
      </Button>
    </div>
  );
}

interface NumberSelectorProps extends Omit<FilterCellPassthroughProps, "onChange"> {
  value: number;
  onValueChange?: (value: number) => void;
  label: string;
  step?: number;
  min?: number;
  max?: number;
  /** The value the reset returns to; `min` without it. */
  defaultValue?: number;
}

/** A "at least n" filter: a stepper and a row of round presets. */
export function NumberSelector({
  value,
  onValueChange,
  label,
  step = 1,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  defaultValue,
  contentClassName,
  ...props
}: NumberSelectorProps) {
  const resetValue = defaultValue ?? min;
  const presets = [...new Set([min, step, step * 5, step * 10, step * 50])].filter((v) => v >= min && v <= max);

  return (
    <FilterCell
      label={label}
      value={value > min ? `≥ ${value}` : "Any"}
      active={value !== resetValue}
      onReset={() => onValueChange?.(resetValue)}
      contentClassName={cn("w-auto min-w-56 p-3", contentClassName)}
      {...props}
    >
      <div className="flex flex-col gap-2">
        <NumberSelectorBare value={value} onValueChange={onValueChange} step={step} min={min} max={max} />
        <Segmented
          value={String(value)}
          onValueChange={(v) => onValueChange?.(Number(v))}
          aria-label={`${label} presets`}
          className="flex-nowrap"
        >
          {presets.map((preset) => (
            <SegmentedItem key={preset} value={String(preset)}>
              {preset === 0 ? "Any" : preset}
            </SegmentedItem>
          ))}
        </Segmented>
      </div>
    </FilterCell>
  );
}
