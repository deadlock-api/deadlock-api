import { createFilter } from "./createFilter";

const VIEW_MODES = ["kills", "deaths", "kd"] as const;
type ViewMode = (typeof VIEW_MODES)[number];

const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  kills: "Kills",
  deaths: "Deaths",
  kd: "K/D",
};

export const HeatmapViewModeFilter = createFilter<{
  value: string;
  onChange: (mode: string) => void;
}>({
  useDescription(props) {
    return {
      viewMode: VIEW_MODE_LABELS[props.value as ViewMode] ?? props.value,
    };
  },
  Render({ value, onChange }) {
    return (
      <div className="inline-flex items-center rounded-full border border-white/[0.08] bg-secondary p-0.5">
        {VIEW_MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            className={`cursor-pointer rounded-full px-3 py-1 text-sm transition-all ${
              value === mode
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {VIEW_MODE_LABELS[mode]}
          </button>
        ))}
      </div>
    );
  },
});
