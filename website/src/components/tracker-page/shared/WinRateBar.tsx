import { cn } from "~/lib/utils";

/** Decorative companion to a visible win-rate label. The tick marks the comparison baseline. */
export function WinRateBar({
  rate,
  baseline,
  className,
}: {
  rate: number | null;
  baseline?: number;
  className?: string;
}) {
  return (
    <div className={cn("relative h-1.5 min-w-0 rounded-full bg-muted", className)} aria-hidden="true">
      {rate !== null && (
        <div className="flex h-full overflow-hidden rounded-full">
          <span className="bg-victory" style={{ width: `${rate * 100}%` }} />
          <span className="flex-1 bg-primary" />
        </div>
      )}
      {rate !== null && baseline !== undefined && (
        <span className="absolute -top-0.5 h-2.5 w-px bg-foreground" style={{ left: `${baseline * 100}%` }} />
      )}
    </div>
  );
}
