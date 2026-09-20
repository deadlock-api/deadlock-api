import { StringOption, StringSelector } from "~/components/patterns/filter-bar/StringSelector";
import { useControllableState } from "~/components/ui/hooks/use-controllable-state";

export function TeamFilter({
  value: valueProp,
  defaultValue = 0,
  onValueChange,
  ...props
}: Omit<
  React.ComponentProps<typeof StringSelector>,
  "label" | "value" | "defaultValue" | "onValueChange" | "children"
> & {
  value?: number;
  /** The team it starts on when uncontrolled, and the one the reset returns to. */
  defaultValue?: number;
  onValueChange?: (team: number) => void;
}) {
  const [value, setValue] = useControllableState({
    value: valueProp,
    defaultValue,
    onValueChange,
  });
  return (
    <StringSelector
      label="Team"
      value={String(value)}
      onValueChange={(team) => setValue(Number(team))}
      defaultValue={String(defaultValue)}
      {...props}
    >
      <StringOption value="0">The Hidden King</StringOption>
      <StringOption value="1">The Archmother</StringOption>
    </StringSelector>
  );
}
