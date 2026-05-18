import { createFilter } from "./createFilter";

export const DimensionToggleFilter = createFilter<{
  value: boolean;
  onChange: (is3D: boolean) => void;
}>({
  useDescription(props) {
    return { dimension: props.value ? "3D" : "2D" };
  },
  Render({ value, onChange }) {
    return (
      <div className="inline-flex items-center rounded-full border border-white/[0.08] bg-secondary p-0.5">
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`cursor-pointer rounded-full px-3 py-1 text-sm transition-all ${
            !value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          2D
        </button>
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`cursor-pointer rounded-full px-3 py-1 text-sm transition-all ${
            value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          3D
        </button>
      </div>
    );
  },
});
