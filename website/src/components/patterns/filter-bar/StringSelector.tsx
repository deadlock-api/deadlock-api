import { Children, createContext, isValidElement, type ReactNode, use } from "react";

import { FilterCell, type FilterCellPassthroughProps } from "~/components/patterns/filter-bar/FilterCell";
import { useControllableState } from "~/components/ui/hooks/use-controllable-state";
import { OptionRow } from "~/components/ui/option-row";
import { cn } from "~/lib/utils";

const StringSelectorContext = createContext<{
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

/** One choice of a `StringSelector`: a row of its menu. */
export function StringOption({ value, disabled = false, className, onClick, children, ...props }: StringOptionProps) {
  const context = use(StringSelectorContext);
  if (!context) throw new Error("StringOption must be used inside a StringSelector");
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

/** Options of a long `StringSelector` under a heading ("Combat", "Economy"). */
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
  const hasEmptyOption = optionElements.some((child) => child.props.value === "");

  // The empty option names itself ("Any") when it is the choice.
  const displayValue = optionElements.find((child) => child.props.value === current)?.props.children;
  const resetValue = defaultValue ?? (hasEmptyOption ? "" : undefined);
  const active = resetValue != null ? current !== resetValue : current !== "";

  const items = (
    <StringSelectorContext value={{ value: current, select: setCurrent }}>{children}</StringSelectorContext>
  );

  return (
    <FilterCell
      label={label}
      value={typeof displayValue === "string" ? displayValue : undefined}
      active={active}
      onReset={resetValue == null ? undefined : () => setCurrent(resetValue)}
      contentClassName={cn("w-auto min-w-44 p-1", contentClassName)}
      {...props}
    >
      {/* A menu, like every filter's popover: one row per option, a check on the chosen one. */}
      <div className="flex max-h-80 flex-col overflow-y-auto">{items}</div>
    </FilterCell>
  );
}
