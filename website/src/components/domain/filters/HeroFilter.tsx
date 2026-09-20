import { HeroSelector } from "~/components/domain/selectors/HeroSelector";

export function HeroFilter({
  value,
  defaultValue,
  onValueChange,
  allowNull,
  label,
  ...props
}: Omit<React.ComponentProps<typeof HeroSelector>, "value" | "defaultValue" | "onValueChange" | "label"> & {
  /** `null` is "any hero". */
  value?: number | null;
  /** The hero it starts on when uncontrolled, and the one the reset returns to. */
  defaultValue?: number | null;
  onValueChange?: (heroId: number | null) => void;
  allowNull?: boolean;
  label?: string;
}) {
  return (
    <HeroSelector
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      allowSelectNull={allowNull}
      label={label}
      {...props}
    />
  );
}
