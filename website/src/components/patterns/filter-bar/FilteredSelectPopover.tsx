import { ChevronDownIcon } from "lucide-react";
import { Children, createContext, isValidElement, type ReactNode, use, useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { useControllableState } from "~/components/ui/hooks/use-controllable-state";
import { OptionRow } from "~/components/ui/option-row";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { SearchInput } from "~/components/ui/search-input";
import { Separator } from "~/components/ui/separator";
import { cn } from "~/lib/utils";

type OptionValue = string | number;

const FilteredSelectContext = createContext<{
  value: readonly OptionValue[];
  toggle: (value: OptionValue) => void;
} | null>(null);

interface FilteredSelectOptionProps extends Omit<React.ComponentProps<typeof OptionRow>, "value" | "selected"> {
  value: OptionValue;
  /** The row: an image and a name. A `FilteredSelectPopover` draws the same content in the chip of a chosen option. */
  children: ReactNode;
  /** The option's name as text, for the search a long list shows. */
  textValue?: string;
}

/** One entry of a `FilteredSelectList` or `FilteredSelectPopover`; it must be a direct child. */
export function FilteredSelectOption({
  value,
  children,
  onClick,
  textValue: _textValue,
  ...props
}: FilteredSelectOptionProps) {
  const context = use(FilteredSelectContext);
  if (!context)
    throw new Error("FilteredSelectOption must be used inside a FilteredSelectList or FilteredSelectPopover");
  const selected = context.value.includes(value);
  return (
    <OptionRow
      selected={selected}
      aria-pressed={selected}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) context.toggle(value);
      }}
      {...props}
    >
      <span className="flex min-w-0 items-center gap-2">{children}</span>
    </OptionRow>
  );
}

interface SelectionProps<T extends OptionValue> {
  value?: T[];
  defaultValue?: T[];
  onValueChange?: (value: T[]) => void;
  /** `FilteredSelectOption`s, as direct children. */
  children?: ReactNode;
}

const NOTHING: never[] = [];

/** Lists longer than this show a search field. */
const SEARCH_FROM = 12;

function useFilteredSelect<T extends OptionValue>({
  value: valueProp,
  defaultValue = NOTHING,
  onValueChange,
  children,
}: SelectionProps<T>) {
  const [value, setValue] = useControllableState<T[]>({
    value: valueProp,
    defaultValue,
    onValueChange,
  });
  const options = Children.toArray(children).filter((child) => isValidElement<FilteredSelectOptionProps>(child));
  const allValues = options.map((option) => option.props.value as T);
  const toggle = (next: OptionValue) =>
    setValue(value.includes(next as T) ? value.filter((entry) => entry !== next) : [...value, next as T]);
  return { value, setValue, options, allValues, toggle };
}

type FilteredSelectListProps<T extends OptionValue> = SelectionProps<T> &
  Omit<React.ComponentProps<"div">, keyof SelectionProps<T>>;

function SelectList<T extends OptionValue>({
  state,
  className,
  ...props
}: { state: ReturnType<typeof useFilteredSelect<T>> } & React.ComponentProps<"div">) {
  const { value, setValue, options, allValues, toggle } = state;
  const allSelected = allValues.length > 0 && value.length === allValues.length;
  // A long list of named options opens on a search field (the popover focuses it first), not on "Select all", where a
  // stray Enter selected every one of 173 items. While searching, "Select all" steps aside.
  const [query, setQuery] = useState("");
  const searchable = options.length > SEARCH_FROM && options.some((option) => option.props.textValue);
  const term = query.trim().toLowerCase();
  const shown = term ? options.filter((option) => option.props.textValue?.toLowerCase().includes(term)) : options;
  return (
    <div data-slot="filtered-select-list" className={cn("flex flex-col gap-0.5", className)} {...props}>
      {searchable && (
        <SearchInput
          size="sm"
          aria-label="Search the options"
          placeholder="Search…"
          value={query}
          onValueChange={setQuery}
        />
      )}
      {!term && (
        <>
          <OptionRow
            selected={allSelected}
            aria-pressed={allSelected}
            hint={`${value.length}/${allValues.length}`}
            onClick={() => setValue(allSelected ? [] : allValues)}
          >
            Select all
          </OptionRow>
          <Separator />
        </>
      )}
      <FilteredSelectContext value={{ value, toggle }}>{shown}</FilteredSelectContext>
      {term && shown.length === 0 && <p className="px-2 py-3 text-center text-xs text-muted-foreground">No matches</p>}
    </div>
  );
}

/** A multi-select list with a select-all row; the body shared by every multi-select popover. */
export function FilteredSelectList<T extends OptionValue = number>({
  value,
  defaultValue,
  onValueChange,
  children,
  ...props
}: FilteredSelectListProps<T>) {
  const state = useFilteredSelect<T>({ value, defaultValue, onValueChange, children });
  return <SelectList state={state} {...props} />;
}

type FilteredSelectPopoverProps<T extends OptionValue> = SelectionProps<T> &
  Omit<React.ComponentProps<typeof Button>, keyof SelectionProps<T>> & {
    /** What the trigger says while nothing is chosen. */
    emptyLabel?: string;
  };

/** How many selected entries the trigger names before it counts the rest. */
const MAX_CHIPS = 2;

export function FilteredSelectPopover<T extends OptionValue = number>({
  value,
  defaultValue,
  onValueChange,
  children,
  emptyLabel = "Select…",
  className,
  ...props
}: FilteredSelectPopoverProps<T>) {
  const state = useFilteredSelect<T>({ value, defaultValue, onValueChange, children });
  const selected = state.value;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          data-slot="filtered-select-trigger"
          variant="outline"
          className={cn("max-w-full min-w-40 justify-between px-2", className)}
          {...props}
        >
          <span className="flex min-w-0 items-center gap-1 overflow-hidden">
            {selected.length === 0 ? (
              <span className="truncate px-1 font-normal text-muted-foreground">{emptyLabel}</span>
            ) : (
              selected.slice(0, MAX_CHIPS).map((id) => (
                <Badge key={id} variant="muted" className="shrink-0 gap-1">
                  {state.options.find((option) => option.props.value === id)?.props.children ?? id}
                </Badge>
              ))
            )}
            {selected.length > MAX_CHIPS && (
              <span className="shrink-0 text-xs font-normal text-muted-foreground tabular-nums">
                +{selected.length - MAX_CHIPS}
              </span>
            )}
          </span>
          <ChevronDownIcon aria-hidden="true" className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="max-h-96 w-56 overflow-y-auto p-2">
        <SelectList state={state} />
      </PopoverContent>
    </Popover>
  );
}
