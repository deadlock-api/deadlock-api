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

interface StringSelectorProps extends FilterCellPassthroughProps {
  label?: string;
  value?: string | null;
  /** The value the filter starts from and resets to. Without it (and without an empty option) there is no reset. */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** `StringOption`s, as direct children. */
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

  const optionElements = Children.toArray(children).filter((child) => isValidElement<StringOptionProps>(child));
  const hasEmptyOption = optionElements.some((child) => child.props.value === "");
  const display = optionElements.length <= SEGMENTED_MAX_OPTIONS ? "segmented" : "list";

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
        <div className="flex flex-col">{items}</div>
      )}
    </FilterCell>
  );
}
