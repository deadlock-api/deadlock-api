import { barGeometry, deltaBarColor, deltaClass, formatPoints } from "~/lib/team-builder/format";
import { cn } from "~/lib/utils";

/** A signed number of win-rate points, coloured by its sign. */
export function DeltaValue({
  value,
  className,
  format = formatPoints,
}: {
  value: number | undefined;
  className?: string;
  format?: (value: number | undefined) => string;
}) {
  return <span className={cn("tabular-nums", deltaClass(value), className)}>{format(value)}</span>;
}

/** Centre-anchored bar with a tick on the even point, so the sign reads before the magnitude. */
export function DeltaBar({
  value,
  scale,
  className,
}: {
  value: number | undefined;
  scale: number;
  className?: string;
}) {
  return (
    <div className={cn("relative h-1.5 rounded-full bg-muted", className)}>
      <div
        className="absolute inset-y-0 rounded-full"
        style={{ ...barGeometry(value, scale), background: deltaBarColor(value) }}
      />
      <div className="absolute inset-y-[-2px] left-1/2 w-px bg-white/25" />
    </div>
  );
}
