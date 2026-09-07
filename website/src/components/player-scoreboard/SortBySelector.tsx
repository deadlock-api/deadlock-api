import { CheckIcon } from "lucide-react";
import { useMemo } from "react";

import { FilterCell } from "~/components/Filter/FilterCell";
import { Segmented } from "~/components/Segmented";
import { cn } from "~/lib/utils";

import { buildSortByValue, parseSortByValue, SORT_CATEGORIES, type SortVariant } from "./sort-options";

interface SortBySelectorProps {
  value: string;
  onChange: (value: string) => void;
}

const VARIANT_OPTIONS: { value: SortVariant; label: string }[] = [
  { value: "avg", label: "AVG" },
  { value: "max", label: "MAX" },
  { value: "total", label: "TOTAL" },
];

export function SortBySelector({ value, onChange }: SortBySelectorProps) {
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
    <FilterCell label="Sort by" value={displayValue} className="w-52 p-2">
      {hasVariants && (
        <Segmented
          value={variant ?? ""}
          onValueChange={(newVariant) => onChange(buildSortByValue(key, newVariant))}
          options={VARIANT_OPTIONS}
          className="mb-2"
        />
      )}
      <div className="flex max-h-[300px] flex-col overflow-y-auto">
        {SORT_CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            type="button"
            className={cn(
              "flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent",
              key === cat.key && "font-medium",
            )}
            onClick={() => handleCategoryChange(cat.key)}
          >
            {cat.label}
            {key === cat.key && <CheckIcon className="size-3.5" />}
          </button>
        ))}
      </div>
    </FilterCell>
  );
}
