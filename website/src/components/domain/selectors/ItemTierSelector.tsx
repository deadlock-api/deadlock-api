import { Layers3Icon } from "lucide-react";

import { Field } from "~/components/ui/field";
import { anyPressed, anyValue } from "~/components/ui/hooks/any-selection";
import { useControllableState } from "~/components/ui/hooks/use-controllable-state";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";

export const NORMAL_ITEM_TIERS = [1, 2, 3, 4];
/** Street Brawl also sells tier 5 items. */
export const STREET_BRAWL_ITEM_TIERS = [...NORMAL_ITEM_TIERS, 5];

/** Which shop tiers to show: the pressed ones, or every tier while none is pressed. */
export function ItemTierSelector({
  tiers = NORMAL_ITEM_TIERS,
  value: valueProp,
  defaultValue = tiers,
  onValueChange,
  disabled = false,
  ...props
}: Omit<React.ComponentProps<typeof Field>, "label" | "icon" | "children" | "defaultValue"> & {
  /** The tiers offered, in this order; 1 to 4 by default. */
  tiers?: number[];
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
    <Field label="Tiers" icon={<Layers3Icon aria-hidden="true" className="size-3.5 shrink-0" />} {...props}>
      <ToggleGroup
        type="multiple"
        variant="outline"
        disabled={disabled}
        value={anyPressed(tiers, value).map(String)}
        onValueChange={(pressed) => setValue(anyValue(tiers, pressed.map(Number)))}
      >
        {tiers.map((tier) => (
          <ToggleGroupItem key={tier} value={String(tier)} aria-label={`Tier ${tier}`}>
            {tier}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Field>
  );
}
