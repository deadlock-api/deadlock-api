import { CheckIcon } from "lucide-react";
import { FilterPill } from "~/components/FilterPill";
import { cn } from "~/lib/utils";

export interface StringSelectorProps {
  options: { value: string; label: string }[];
  onSelect: (selected: string) => void;
  selected?: string | null;
  allowSelectNull?: boolean;
  placeholder?: string;
  label?: string;
  defaultValue?: string;
}

export function StringSelector({
  options,
  onSelect,
  selected,
  allowSelectNull = false,
  label,
  defaultValue,
}: StringSelectorProps) {
  const valueLabelMap = new Map<string, string>(options.map((o) => [o.value, o.label]));
  const displayValue = selected ? valueLabelMap.get(selected) : undefined;
  const isActive = defaultValue != null ? selected !== defaultValue : selected != null;

  return (
    <FilterPill label={label ?? ""} value={displayValue} active={isActive} className="w-40">
      <div className="flex flex-col">
        {allowSelectNull && (
          <button
            type="button"
            className={cn(
              "flex items-center justify-between gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-accent cursor-pointer",
              !selected && "font-medium",
            )}
            onClick={() => onSelect("")}
          >
            None
            {!selected && <CheckIcon className="size-3.5" />}
          </button>
        )}
        {options.map((item) => (
          <button
            key={item.value}
            type="button"
            className={cn(
              "flex items-center justify-between gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-accent cursor-pointer text-left",
              selected === item.value && "font-medium",
            )}
            onClick={() => onSelect(item.value)}
          >
            {item.label}
            {selected === item.value && <CheckIcon className="size-3.5" />}
          </button>
        ))}
      </div>
    </FilterPill>
  );
}
