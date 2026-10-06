import { Children, createContext, isValidElement, type ReactNode, use } from "react";

import { FilterCell, type FilterCellPassthroughProps } from "~/components/patterns/filter-bar/FilterCell";
import { useControllableState } from "~/components/ui/hooks/use-controllable-state";
import { OptionRow } from "~/components/ui/option-row";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { cn } from "~/lib/utils";

/** Up to this many choices switch in one tap; longer lists keep the scrollable menu. */
const SEGMENTED_MAX_OPTIONS = 5;

/** Radix ToggleGroup treats "" as "nothing selected", so the null choice needs its own value. */
const NULL_VALUE = " ";

const StringSelectorContext = createContext<{
  display: "segmented" | "list";
  value: string;
  select: (value: string) => void;
} | null>(null);

interface StringOptionProps extends Omit<React.ComponentProps<"button">, "value"> {
  /** `""` is the choice of nothing: "Any", "None". */
  value: string;
  disabled?: boolean;
  /** The label. It is also what the cell shows when this option is chosen, so keep it to text. */
  children: ReactNode;
}

/** One choice of a `StringSelector`, which draws it as a segment or as a row depending on how many there are. */
export function StringOption({ value, disabled = false, className, onClick, children, ...props }: StringOptionProps) {
  const context = use(StringSelectorContext);
  if (!context) throw new Error("StringOption must be used inside a StringSelector");
  if (context.display === "segmented") {
    return (
      <SegmentedItem
        value={value === "" ? NULL_VALUE : value}
        disabled={disabled}
        className={className}
        onClick={onClick}
        {...props}
      >
        {children}
      </SegmentedItem>
    );
  }
  return (
    <OptionRow
      selected={context.value === value}
      disabled={disabled}
      className={className}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        context.select(value);
      }}
      {...props}
    >
      {children}
    </OptionRow>
  );
}

interface StringOptionGroupProps extends Omit<React.ComponentProps<"fieldset">, "children"> {
  /** Names the group, above its options. */
  label: string;
  /** `StringOption`s. */
  children?: ReactNode;
}

/** Options of a long `StringSelector` under a heading ("Combat", "Economy"). Groups always show the list. */
export function StringOptionGroup({ label, className, children, ...props }: StringOptionGroupProps) {
  return (
    <fieldset data-slot="string-option-group" className={cn("flex min-w-0 flex-col", className)} {...props}>
      <legend className="px-2 pt-2 pb-1 type-caption font-semibold text-muted-foreground">{label}</legend>
      {children}
    </fieldset>
  );
}

/** The options among the children, those inside groups included. */
function optionsOf(children: ReactNode): React.ReactElement<StringOptionProps>[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement<StringOptionProps | StringOptionGroupProps>(child)) return [];
    if (child.type === StringOptionGroup) return optionsOf(child.props.children);
    return [child as React.ReactElement<StringOptionProps>];
  });
}

interface StringSelectorProps extends FilterCellPassthroughProps {
  label?: string;
  value?: string | null;
  /** The value the filter starts from and resets to. Without it (and without an empty option) there is no reset. */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** `StringOption`s, as direct children or inside `StringOptionGroup`s. */
  children?: ReactNode;
}

export function StringSelector({
  label = "",
  value: valueProp,
  defaultValue,
  onValueChange,
  contentClassName,
  children,
  ...props
}: StringSelectorProps) {
  const [current, setCurrent] = useControllableState<string>({
    value: valueProp === undefined ? undefined : (valueProp ?? ""),
    defaultValue: defaultValue ?? "",
    onValueChange,
  });

  const optionElements = optionsOf(children);
  const grouped = Children.toArray(children).some((child) => isValidElement(child) && child.type === StringOptionGroup);
  const hasEmptyOption = optionElements.some((child) => child.props.value === "");
  const display = !grouped && optionElements.length <= SEGMENTED_MAX_OPTIONS ? "segmented" : "list";

  const displayValue = current
    ? optionElements.find((child) => child.props.value === current)?.props.children
    : undefined;
  const resetValue = defaultValue ?? (hasEmptyOption ? "" : undefined);
  const active = resetValue != null ? current !== resetValue : current !== "";

  const items = (
    <StringSelectorContext value={{ display, value: current, select: setCurrent }}>{children}</StringSelectorContext>
  );

  return (
    <FilterCell
      label={label}
      value={typeof displayValue === "string" ? displayValue : undefined}
      active={active}
      onReset={resetValue == null ? undefined : () => setCurrent(resetValue)}
      contentClassName={cn(display === "segmented" ? "w-auto" : "w-48", contentClassName)}
      {...props}
    >
      {display === "segmented" ? (
        <Segmented
          value={current === "" ? (hasEmptyOption ? NULL_VALUE : "") : current}
          onValueChange={(next) => setCurrent(next === NULL_VALUE ? "" : next)}
        >
          {items}
        </Segmented>
      ) : (
        // A long list scrolls inside the popover instead of running off the screen.
        <div className="flex max-h-80 flex-col overflow-y-auto">{items}</div>
      )}
    </FilterCell>
  );
}
