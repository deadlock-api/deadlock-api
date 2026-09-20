import { Field } from "~/components/ui/field";
import { useControllableState } from "~/components/ui/hooks/use-controllable-state";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";

const TIERS = [1, 2, 3, 4];

/** Which shop tiers to show: every pressed tier is kept. */
export function ItemTierSelector({
  value: valueProp,
  defaultValue = TIERS,
  onValueChange,
  disabled = false,
  ...props
}: Omit<React.ComponentProps<typeof Field>, "label" | "icon" | "children" | "defaultValue"> & {
  value?: number[];
  defaultValue?: number[];
  onValueChange?: (tiers: number[]) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useControllableState({
    value: valueProp,
    defaultValue,
    onValueChange,
  });
  return (
    <Field label="Tiers" icon={<span aria-hidden="true" className="icon-[mdi--layers-triple] size-3" />} {...props}>
      <ToggleGroup
        type="multiple"
        variant="outline"
        size="sm"
        disabled={disabled}
        value={value.map(String)}
        onValueChange={(tiers) => setValue(tiers.map(Number))}
      >
        {TIERS.map((tier) => (
          <ToggleGroupItem key={tier} value={String(tier)} aria-label={`Tier ${tier}`}>
            {tier}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Field>
  );
}
