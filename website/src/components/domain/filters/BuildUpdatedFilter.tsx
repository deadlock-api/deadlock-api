import { StringOption, StringSelector } from "~/components/patterns/filter-bar/StringSelector";

/** How recently a build must have been updated, in days. */
const WINDOWS = [7, 30, 90] as const;

/** How recently a build was last updated, in days; null for any time. Old builds may predate the hero's last changes. */
export function BuildUpdatedFilter({
  value,
  defaultValue = null,
  onValueChange,
  label = "Updated",
  ...props
}: Omit<React.ComponentProps<typeof StringSelector>, "value" | "defaultValue" | "onValueChange" | "children"> & {
  value?: number | null;
  defaultValue?: number | null;
  onValueChange?: (days: number | null) => void;
}) {
  return (
    <StringSelector
      label={label}
      value={value === undefined ? undefined : value === null ? "" : String(value)}
      defaultValue={defaultValue === null ? "" : String(defaultValue)}
      onValueChange={(next) => onValueChange?.(next === "" ? null : Number(next))}
      {...props}
    >
      <StringOption value="">Any time</StringOption>
      {WINDOWS.map((days) => (
        <StringOption key={days} value={String(days)}>
          {`${days} days`}
        </StringOption>
      ))}
    </StringSelector>
  );
}
