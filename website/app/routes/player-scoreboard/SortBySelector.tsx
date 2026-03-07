import { useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
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
      // Keep current variant if possible, default to "avg"
      onChange(buildSortByValue(newKey, variant && cat.variants.includes(variant) ? variant : "avg"));
    } else {
      onChange(newKey);
    }
  };

  const handleVariantChange = (newVariant: SortVariant) => {
    onChange(buildSortByValue(key, newVariant));
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-center md:justify-start items-center h-8">
        <span className="text-sm font-semibold text-foreground">Sort By</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Select value={key} onValueChange={handleCategoryChange}>
          <SelectTrigger className="w-40 focus-visible:ring-0">
            <SelectValue>{currentCategory?.label ?? key}</SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-[70vh] overflow-y-scroll">
            {SORT_CATEGORIES.map((cat) => (
              <SelectItem key={cat.key} value={cat.key}>
                {cat.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasVariants && (
          <div className="flex rounded-md border border-input overflow-hidden">
            {VARIANT_LABELS.map((v) => (
              <button
                key={v.value}
                type="button"
                onClick={() => handleVariantChange(v.value)}
                className={cn(
                  "px-2 py-1.5 text-xs font-medium transition-colors cursor-pointer",
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
      </div>
    </div>
  );
}
