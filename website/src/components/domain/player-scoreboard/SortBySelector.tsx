import { useMemo } from "react";

import { FilterCell } from "~/components/patterns/filter-bar/FilterCell";
import { useControllableState } from "~/components/ui/hooks/use-controllable-state";
import { OptionRow } from "~/components/ui/option-row";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";

import { buildSortByValue, parseSortByValue, SORT_CATEGORIES, type SortVariant } from "./sort-options";

interface SortBySelectorProps extends Omit<
  React.ComponentProps<typeof FilterCell>,
  "label" | "value" | "defaultValue" | "active" | "onReset" | "children"
> {
  value?: string;
  /** The sort it starts with when uncontrolled, and the one the reset returns to. */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}

const VARIANT_OPTIONS: { value: SortVariant; label: string }[] = [
  { value: "avg", label: "AVG" },
  { value: "max", label: "MAX" },
  { value: "total", label: "TOTAL" },
];

export function SortBySelector({
  value: valueProp,
  defaultValue = "kills",
  onValueChange,
  ...props
}: SortBySelectorProps) {
  const [value, onChange] = useControllableState({
    value: valueProp,
    defaultValue,
    onValueChange,
  });
  const { key, variant } = useMemo(() => parseSortByValue(value), [value]);

  const currentCategory = useMemo(() => SORT_CATEGORIES.find((c) => c.key === key), [key]);
  const hasVariants = currentCategory?.variants != null;

  const handleCategoryChange = (newKey: string) => {
    const cat = SORT_CATEGORIES.find((c) => c.key === newKey);
    if (!cat) return;
    if (cat.variants) {
      onChange(buildSortByValue(newKey, variant && cat.variants.includes(variant) ? variant : "avg"));
    } else {
      onChange(newKey);
    }
  };

  const displayValue = currentCategory?.label ?? key;

  return (
    <FilterCell
      label="Sort by"
      value={displayValue}
      active={value !== defaultValue}
      onReset={() => onChange(defaultValue)}
      contentClassName="flex w-52 flex-col gap-2 p-2"
      {...props}
    >
      {hasVariants && (
        <Segmented value={variant ?? ""} onValueChange={(newVariant) => onChange(buildSortByValue(key, newVariant))}>
          {VARIANT_OPTIONS.map((option) => (
            <SegmentedItem key={option.value} value={option.value}>
              {option.label}
            </SegmentedItem>
          ))}
        </Segmented>
      )}
      <div className="flex max-h-75 flex-col overflow-y-auto">
        {SORT_CATEGORIES.map((cat) => (
          <OptionRow key={cat.key} selected={key === cat.key} onClick={() => handleCategoryChange(cat.key)}>
            {cat.label}
          </OptionRow>
        ))}
      </div>
    </FilterCell>
  );
}
