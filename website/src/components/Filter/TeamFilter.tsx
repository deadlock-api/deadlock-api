import { createFilter } from "./createFilter";

const TEAMS = [
  { value: 0, label: "The Hidden King" },
  { value: 1, label: "The Archmother" },
] as const;

export const TeamFilter = createFilter<{
  value: number;
  onChange: (team: number) => void;
}>({
  useDescription(props) {
    const teamLabel = TEAMS.find((t) => t.value === props.value)?.label ?? null;
    return { team: teamLabel };
  },
  Render({ value, onChange }) {
    return (
      <div className="inline-flex items-center rounded-full border border-white/[0.08] bg-secondary p-0.5">
        {TEAMS.map((team) => (
          <button
            key={team.value}
            type="button"
            onClick={() => onChange(team.value)}
            className={`cursor-pointer rounded-full px-3 py-1 text-sm transition-all ${
              value === team.value
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {team.label}
          </button>
        ))}
      </div>
    );
  },
});
