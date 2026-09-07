import { FilterCell } from "~/components/Filter/FilterCell";
import { Segmented } from "~/components/Segmented";

export function NumberSelectorBare({
  value,
  onChange,
  step,
  min,
  max,
}: {
  value: number;
  onChange: (val: number) => void;
  step: number;
  min?: number;
  max?: number;
}) {
  return (
    <div className="flex h-9 w-full min-w-0 items-center rounded-md border bg-transparent px-2 py-1 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/50 md:text-sm">
      <button
        type="button"
        aria-label="Decrease"
        className="cursor-pointer px-2 text-lg font-bold text-muted-foreground hover:text-foreground focus:outline-none"
        onClick={() => onChange(Math.max(min ?? 0, value - step))}
      >
        -
      </button>
      <span className="flex-1 text-center text-muted-foreground select-none" style={{ minWidth: 32 }}>
        {value}
      </span>
      <button
        type="button"
        aria-label="Increase"
        className="cursor-pointer px-2 text-lg font-bold text-muted-foreground hover:text-foreground focus:outline-none"
        onClick={() => onChange(Math.min(max ?? Number.POSITIVE_INFINITY, value + step))}
      >
        +
      </button>
    </div>
  );
}

export function NumberSelector({
  value,
  onChange,
  label,
  step,
  min,
  max,
}: {
  value: number;
  onChange: (val: number) => void;
  label: string;
  step: number;
  min?: number;
  max?: number;
}) {
  const floor = min ?? 0;
  const isActive = value > floor;

  const presets = [...new Set([floor, step, step * 5, step * 10, step * 50])]
    .filter((v) => v >= floor && v <= (max ?? Number.POSITIVE_INFINITY))
    .map((v) => ({ value: String(v), label: v === 0 ? "Any" : String(v) }));

  return (
    <FilterCell label={label} value={isActive ? `≥ ${value}` : "Any"} active={isActive} className="w-auto min-w-56 p-3">
      <div className="flex flex-col gap-2">
        <NumberSelectorBare value={value} onChange={onChange} step={step} min={min} max={max} />
        <Segmented
          value={String(value)}
          onValueChange={(v) => onChange(Number(v))}
          options={presets}
          className="flex-nowrap"
        />
      </div>
    </FilterCell>
  );
}
