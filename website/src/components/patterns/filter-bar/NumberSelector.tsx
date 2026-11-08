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
  max?: number;
  /** The value as it reads: "30%" for 30. */
  format?: (value: number) => string;
  disabled?: boolean;
}

/** A stepper: the value between a minus and a plus button. */
function NumberSelectorBare({
  value,
  onValueChange,
  step = 1,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  format = String,
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
      <output className="min-w-8 flex-1 text-center font-medium tabular-nums select-none">{format(value)}</output>
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
  /** The value the reset returns to; `min` without it. */
  defaultValue?: number;
}

interface ThresholdMenuProps extends Omit<React.ComponentProps<"div">, "onChange" | "children"> {
  value: number;
  onValueChange?: (value: number) => void;
  /** Names the presets for assistive technology: "Min matches presets". */
  label: string;
  /** The round thresholds offered as rows; `min` reads "Any". */
  presets: readonly number[];
  step?: number;
  min?: number;
  max?: number;
  /** A threshold as it reads: "30%" for 30. */
  format?: (value: number) => string;
}

/**
 * An "at least n" choice: round presets as a menu of option rows, then a stepper for any other number. The body of
 * `NumberSelector`'s popover, and of a `ColumnFilter` that keeps rows above a threshold.
 */
export function ThresholdMenu({
  value,
  onValueChange,
  label,
  presets,
  step = 1,
  min = 0,
  max,
  format = String,
  className,
  ...props
}: ThresholdMenuProps) {
  return (
    <div data-slot="threshold-menu" className={cn("flex flex-col gap-1", className)} {...props}>
      <fieldset aria-label={`${label} presets`} className="flex min-w-0 flex-col">
        {presets.map((preset) => (
          <OptionRow
            key={preset}
            selected={value === preset}
            aria-pressed={value === preset}
            onClick={() => onValueChange?.(preset)}
          >
            {preset === min ? "Any" : `≥ ${format(preset)}`}
          </OptionRow>
        ))}
      </fieldset>
      <div className="flex items-center gap-3 border-t ps-2 pt-2">
        <span className="shrink-0 type-caption text-muted-foreground">Custom</span>
        <NumberSelectorBare
          value={value}
          onValueChange={onValueChange}
          step={step}
          min={min}
          max={max}
          format={format}
        />
      </div>
    </div>
  );
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
      <ThresholdMenu
        value={value}
        onValueChange={onValueChange}
        label={label}
        presets={presets}
        step={step}
        min={min}
      />
    </FilterCell>
  );
}
