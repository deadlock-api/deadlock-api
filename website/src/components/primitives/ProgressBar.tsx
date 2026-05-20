import type { ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import type { Color } from "~/types/general";

export function ProgressBar({
  value,
  min,
  max,
  color,
  segments,
}: {
  value?: number;
  min?: number;
  max?: number;
  color?: Color;
  segments?: { value: number; color: string }[];
}) {
  const minVal = min || 0;
  const maxVal = max || 1;

  if (segments && segments.length > 0) {
    const total = segments.reduce((s, seg) => s + seg.value, 0);
    const totalWidth = ((total - minVal) / (maxVal - minVal)) * 100;
    return (
      <div className="h-2.5 w-full bg-muted">
        <div
          className="flex h-2.5 transition-all duration-300 ease-in-out"
          style={{ width: `${Math.max(0, Math.min(100, totalWidth))}%` }}
        >
          {segments.map((seg) => (
            <div
              key={seg.color}
              className="h-2.5"
              style={{ backgroundColor: seg.color, width: `${(seg.value / total) * 100}%` }}
            />
          ))}
        </div>
      </div>
    );
  }

  const clamped = Math.max(Math.min(value || 0, maxVal), minVal);
  return (
    <div className="h-2.5 w-full bg-muted">
      <div
        className="h-2.5 transition-all duration-300 ease-in-out"
        style={{
          backgroundColor: color || "#fa4454",
          width: `${((clamped - minVal) / (maxVal - minVal)) * 100}%`,
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
  deltaFormat = "percent",
  tooltip,
  segments,
}: {
  value?: number;
  min?: number;
  max?: number;
  color?: Color;
  label?: ReactNode;
  delta?: number;
  deltaFormat?: "percent" | "raw";
  tooltip?: ReactNode;
  segments?: { value: number; color: string }[];
}) {
  const percentage = Math.round((((value || 0) - (min || 0)) / ((max || 1) - (min || 0))) * 100);
  const formatDelta = (d: number) => {
    if (deltaFormat === "raw") return `${d > 0 ? "+" : ""}${d.toFixed(1)}`;
    return `${d > 0 ? "+" : ""}${(d * 100).toFixed(1)}%`;
  };
  const content = (
    <div className={`flex w-full flex-col gap-2 min-w-24${tooltip ? " cursor-default" : ""}`}>
      <ProgressBar value={value} min={min} max={max} color={color} segments={segments} />
      <div className="flex items-baseline gap-1.5">
        <span className="text-left text-sm text-muted-foreground">{label || `${percentage}%` || 0}</span>
        {delta !== undefined && delta !== 0 && (
          <span className={`text-xs font-medium ${delta > 0 ? "text-green-500" : "text-red-500"}`}>
            {formatDelta(delta)}
          </span>
        )}
      </div>
    </div>
  );

  if (!tooltip) return content;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent className="border border-border bg-popover p-3 text-popover-foreground shadow-md [&>svg]:bg-popover [&>svg]:fill-popover">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}
