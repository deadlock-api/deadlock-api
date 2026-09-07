import { StringSelector } from "~/components/selectors/StringSelector";

const TEAMS = [
  { value: "0", label: "The Hidden King" },
  { value: "1", label: "The Archmother" },
];

export function TeamFilter({ value, onChange }: { value: number; onChange: (team: number) => void }) {
  return (
    <StringSelector
      label="Team"
      options={TEAMS}
      selected={String(value)}
      onSelect={(team) => onChange(Number(team))}
      defaultValue="0"
    />
  );
}
