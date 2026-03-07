import { CheckIcon } from "lucide-react";
import { useMemo } from "react";
import { FilterPill } from "~/components/FilterPill";
import { cn } from "~/lib/utils";
import { buildSortByValue, parseSortByValue, SORT_CATEGORIES, type SortVariant } from "./sort-options";

interface SortBySelectorProps {
  value: string;
  onChange: (value: string) => void;
}

const VARIANT_LABELS: { value: SortVariant; label: string }[] = [
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

  const handleVariantChange = (newVariant: SortVariant) => {
    onChange(buildSortByValue(key, newVariant));
  };

  const displayValue = currentCategory?.label ?? key;

  return (
    <FilterPill label="Sort" value={displayValue} active={false} className="w-52 p-2">
      {hasVariants && (
        <div className="flex rounded-md border border-input overflow-hidden mb-2">
          {VARIANT_LABELS.map((v) => (
            <button
              key={v.value}
              type="button"
              onClick={() => handleVariantChange(v.value)}
              className={cn(
                "flex-1 px-2 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                variant === v.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}
      <div className="max-h-[300px] overflow-y-auto flex flex-col">
        {SORT_CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            type="button"
            className={cn(
              "flex items-center justify-between gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-accent cursor-pointer text-left",
              key === cat.key && "font-medium",
            )}
            onClick={() => handleCategoryChange(cat.key)}
          >
            {cat.label}
            {key === cat.key && <CheckIcon className="size-3.5" />}
          </button>
        ))}
      </div>
    </FilterPill>
  );
}
