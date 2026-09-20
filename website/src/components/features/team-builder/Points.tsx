import { Delta } from "~/components/ui/delta";
import { formatPoints, NO_DATA } from "~/lib/team-builder/format";
import { cn } from "~/lib/utils";

interface PointsProps extends Omit<React.ComponentProps<"span">, "children"> {
  value: number | undefined;
  digits?: number;
  align?: "start" | "end";
}

/**
 * A signed number of win-rate points. `Delta` prints nothing for a zero or a missing value; a table cell still has
 * to say `+0.0` or `n/a`, so those two are printed here, in the neutral tone.
 */
export function Points({ value, digits = 1, align = "start", className, ...props }: PointsProps) {
  const alignment = align === "end" && "justify-end text-end";
  const shown = formatPoints(value, digits);
  if (value === undefined || shown === NO_DATA || Number(shown) === 0) {
    return (
      <span className={cn("font-medium text-muted-foreground tabular-nums", alignment, className)} {...props}>
        {shown}
      </span>
    );
  }
  return <Delta value={value} format="number" digits={digits} className={cn(alignment, className)} {...props} />;
}
