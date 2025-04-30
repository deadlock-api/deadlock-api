import type { Color } from "~/types/general";

export function ProgressBar({ value, min, max, color }: { value?: number; min?: number; max?: number; color?: Color }) {
  value = value || 0;
  value = Math.max(value, min || 0);
  value = Math.min(value, max || 1);

  return (
    <div className="w-full bg-gray-200 h-2.5 dark:bg-gray-700">
      <div
        className="h-2.5 transition-all duration-300 ease-in-out"
        style={{
          backgroundColor: color || "rgb(37, 99, 235)",
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
}: { value?: number; min?: number; max?: number; color?: Color; label?: string }) {
  const percentage = Math.round((((value || 0) - (min || 0)) / ((max || 1) - (min || 0))) * 100);
  return (
    <div className="flex flex-col gap-2  min-w-16">
      <ProgressBar value={value} min={min} max={max} color={color} />
      <span className="ml-2 text-sm text-gray-700 dark:text-gray-300 text-left">{label || `${percentage}%` || 0}</span>
    </div>
  );
}
