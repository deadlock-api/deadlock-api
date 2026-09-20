import { FOCUS_RING } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

// "No sample" cannot be a paler fill: a faint tint and an empty cell are the same cell to a colour-blind or
// low-contrast eye, so the empty cell carries a texture instead.
const HATCH_IMAGE =
  "repeating-linear-gradient(45deg, var(--muted-foreground) 0, var(--muted-foreground) 1px, transparent 1px, transparent 4px)";

interface HeatCellProps extends Omit<React.ComponentProps<"button">, "color"> {
  /**
   * The fill, straight from data: a ramp's CSS color. A cell without one is hatched, so "no sample" is told by
   * more than its colour.
   */
  color?: string;
  /** The cell the reader has picked. Marked with a ring and `aria-pressed`, never by fill alone. */
  selected?: boolean;
  /**
   * The native tooltip, opt-in: a cell that already has a hover card would otherwise show both. The accessible
   * name comes from `label`, so leaving it out costs the cell nothing but the hint.
   */
  title?: string;
  /** What the cell stands for, for assistive technology: "Tuesday 18:00, 12 matches". */
  label: string;
}

/**
 * One cell of a heat grid: a square whose fill carries a reading. It is a real button, so the grid is reachable by
 * keyboard and every cell is named; the selected cell is ringed as well as filled, because a fill is already in use
 * for the reading.
 */
export function HeatCell({ color, selected, title, label, className, style, children, ...props }: HeatCellProps) {
  return (
    // ds-allow raw-button: the cell is the hit area of a heat grid, not a Button; its fill comes from the reading
    <button
      type="button"
      data-slot="heat-cell"
      data-pattern={color == null ? "hatch" : "none"}
      aria-label={label}
      {...(title === undefined ? {} : { title })}
      {...(selected === undefined ? {} : { "aria-pressed": selected })}
      className={cn(
        "aspect-square min-h-6 min-w-6 rounded-xs bg-muted transition-colors duration-fast",
        // Hover keeps the ring width of the selected cell and only changes its color, so nothing shifts under the pointer.
        "hover:ring-2 hover:ring-primary",
        FOCUS_RING,
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:ring-0",
        selected && "ring-2 ring-foreground",
        className,
      )}
      style={{ ...(color == null ? { backgroundImage: HATCH_IMAGE } : { backgroundColor: color }), ...style }}
      {...props}
    >
      {children}
    </button>
  );
}
