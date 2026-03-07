import type { Color } from "~/types/general";

export function ProgressBar({ value, min, max, color }: { value?: number; min?: number; max?: number; color?: Color }) {
  value = value || 0;
  value = Math.max(value, min || 0);
  value = Math.min(value, max || 1);

  return (
    <div className="w-full h-2.5 bg-muted">
      <div
        className="h-2.5 transition-all duration-300 ease-in-out"
        style={{
          backgroundColor: color || "#fa4454",
          width: `${(((value || 0) - (min || 0)) / ((max || 1) - (min || 0))) * 100}%`,
        }}
      />
    </div>
  );
}

export function ProgressBarWithLabel({
  value,
  min,
  max,
  color,
  label,
  delta,
}: {
  value?: number;
  min?: number;
  max?: number;
  color?: Color;
  label?: string;
  delta?: number;
}) {
  const percentage = Math.round((((value || 0) - (min || 0)) / ((max || 1) - (min || 0))) * 100);
  return (
    <div className="flex flex-col gap-2  min-w-16">
      <ProgressBar value={value} min={min} max={max} color={color} />
      <div className="flex items-baseline gap-1.5">
        <span className="text-sm text-muted-foreground text-left">{label || `${percentage}%` || 0}</span>
        {delta !== undefined && delta !== 0 && (
          <span
            className={`text-xs font-medium ${delta > 0 ? "text-green-500" : "text-red-500"}`}
          >
            {delta > 0 ? "+" : ""}
            {(delta * 100).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}
