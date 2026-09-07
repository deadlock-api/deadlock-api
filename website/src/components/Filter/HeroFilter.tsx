import { HeroSelector } from "~/components/selectors/HeroSelector";

export function HeroFilter({
  value,
  onChange,
  allowNull,
  label,
}: {
  value: number | null;
  onChange: (heroId: number | null) => void;
  allowNull?: boolean;
  label?: string;
}) {
  return (
    <HeroSelector
      onHeroSelected={(x) => onChange(x ?? null)}
      selectedHero={value ?? undefined}
      allowSelectNull={allowNull}
      label={label}
    />
  );
}
