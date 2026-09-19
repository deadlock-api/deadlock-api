import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { useHydrated } from "~/hooks/useHydrated";

export type MetricOptionGroup = { label: string; options: readonly { value: string; label: string }[] };

/** Grouped metrics keep large option sets accessible without wrapping into several toolbar rows. */
export function MetricSelect({
  value,
  groups,
  onChange,
  label = "Trend metric",
}: {
  value: string;
  groups: readonly MetricOptionGroup[];
  onChange: (value: string) => void;
  label?: string;
}) {
  const hydrated = useHydrated();
  const selectedLabel =
    groups.flatMap((group) => group.options).find((option) => option.value === value)?.label ?? value;
  return (
    <Select disabled={!hydrated} value={value} onValueChange={onChange}>
      <SelectTrigger
        size="sm"
        aria-label={label}
        title={selectedLabel}
        className="w-full min-w-0 sm:w-auto sm:max-w-72 sm:min-w-52"
      >
        <SelectValue>{selectedLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {groups.map((group) => (
          <SelectGroup key={group.label}>
            <SelectLabel>{group.label}</SelectLabel>
            {group.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
