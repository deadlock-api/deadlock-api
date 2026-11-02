import { MinusIcon, PlusIcon } from "lucide-react";

import { FilterCell, type FilterCellPassthroughProps } from "~/components/patterns/filter-bar/FilterCell";
import { Button } from "~/components/ui/button";
import { OptionRow } from "~/components/ui/option-row";
import { cn } from "~/lib/utils";

interface NumberSelectorBareProps extends Omit<React.ComponentProps<"div">, "onChange" | "children"> {
  value: number;
  onValueChange?: (value: number) => void;
  step?: number;
  min?: number;
  disabled?: boolean;
}

/** A stepper: the value between a minus and a plus button. */
function NumberSelectorBare({
  value,
  onValueChange,
  step = 1,
  min = 0,
  disabled = false,
  className,
  ...props
}: NumberSelectorBareProps) {
  return (
    <div
      data-slot="number-selector"
      data-disabled={disabled || undefined}
      className={cn(
        // The ring for keyboard focus only: opening the popover focuses a button, which drew the frame red at once.
        "flex h-8 w-full min-w-0 items-center rounded-md border border-control-border bg-transparent p-0.5 text-sm has-focus-visible:border-ring has-focus-visible:ring-2 has-focus-visible:ring-ring",
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
      <output className="min-w-8 flex-1 text-center font-medium tabular-nums select-none">{value}</output>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Increase"
        className="text-muted-foreground"
        disabled={disabled}
        onClick={() => onValueChange?.(value + step)}
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
  /** The value the reset returns to; `min` without it. */
  defaultValue?: number;
}

/** An "at least n" filter: round presets as a menu, and a stepper for any other number. */
export function NumberSelector({
  value,
  onValueChange,
  label,
  step = 1,
  min = 0,
  defaultValue,
  contentClassName,
  ...props
}: NumberSelectorProps) {
  const resetValue = defaultValue ?? min;
  const presets = [...new Set([min, step, step * 5, step * 10, step * 50])].filter((v) => v >= min);

  return (
    <FilterCell
      label={label}
      value={value > min ? `≥ ${value}` : "Any"}
      active={value !== resetValue}
      onReset={() => onValueChange?.(resetValue)}
      contentClassName={cn("w-auto min-w-56 p-1 pb-2", contentClassName)}
      {...props}
    >
      {/* The presets as a menu, like every filter's popover, then a stepper for any other number. */}
      <div className="flex flex-col gap-1">
        <fieldset aria-label={`${label} presets`} className="flex min-w-0 flex-col">
          {presets.map((preset) => (
            <OptionRow
              key={preset}
              selected={value === preset}
              aria-pressed={value === preset}
              onClick={() => onValueChange?.(preset)}
            >
              {preset === min ? "Any" : `≥ ${preset}`}
            </OptionRow>
          ))}
        </fieldset>
        <div className="flex items-center gap-3 border-t ps-2 pt-2">
          <span className="shrink-0 type-caption text-muted-foreground">Custom</span>
          <NumberSelectorBare value={value} onValueChange={onValueChange} step={step} min={min} />
        </div>
      </div>
    </FilterCell>
  );
}
