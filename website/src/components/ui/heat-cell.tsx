import { cn } from "~/lib/utils";

type HeatTone = "primary" | "positive" | "negative" | "warning" | "info";

const TONE_VAR: Record<HeatTone, string> = {
  primary: "var(--primary)",
  positive: "var(--positive)",
  negative: "var(--negative)",
  warning: "var(--warning)",
  info: "var(--info)",
};

// "No sample" cannot be a paler fill: a faint tint and an empty cell are the same cell to a colour-blind or
// low-contrast eye, so the empty cell carries a texture instead.
const HATCH_IMAGE =
  "repeating-linear-gradient(45deg, var(--muted-foreground) 0, var(--muted-foreground) 1px, transparent 1px, transparent 4px)";

interface HeatCellProps extends Omit<React.ComponentProps<"button">, "color"> {
  /** The fill, straight from data: a ramp's CSS color. Takes precedence over `tone` and `intensity`. */
  color?: string;
  /** Which token the fill is mixed from when the cell derives its own color. */
  tone?: HeatTone;
  /** How much of `tone` the fill carries, 0 to 1. A cell with no reading stays at the empty fill. */
  intensity?: number | null;
  /**
   * The texture over the cell. Defaults to `hatch` for a cell nothing fills, so "no sample" is told by more than
   * its colour, and to `none` as soon as the cell carries a reading.
   */
  pattern?: "none" | "hatch";
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
export function HeatCell({
  color,
  tone = "primary",
  intensity = null,
  pattern,
  selected,
  title,
  label,
  className,
  style,
  children,
  ...props
}: HeatCellProps) {
  const level = intensity == null ? null : Math.max(0, Math.min(1, intensity));
  const fill =
    color ??
    (level == null ? undefined : `color-mix(in oklab, ${TONE_VAR[tone]} ${Math.round(level * 100)}%, transparent)`);
  const resolvedPattern = pattern ?? (fill == null ? "hatch" : "none");
  const drawn = fill != null || resolvedPattern === "hatch";
  return (
    // ds-allow raw-button: the cell is the hit area of a heat grid, not a Button; its fill comes from the reading
    <button
      type="button"
      data-slot="heat-cell"
      data-tone={tone}
      data-pattern={resolvedPattern}
      aria-label={label}
      {...(title === undefined ? {} : { title })}
      {...(selected === undefined ? {} : { "aria-pressed": selected })}
      className={cn(
        "aspect-square min-h-6 min-w-6 rounded-xs bg-muted transition-colors duration-fast",
        // Hover keeps the ring width of the selected cell and only changes its color, so nothing shifts under the pointer.
        "hover:ring-2 hover:ring-primary",
        "outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:ring-0",
        selected && "ring-2 ring-foreground",
        className,
      )}
      style={
        drawn
          ? {
              ...(fill == null ? null : { backgroundColor: fill }),
              ...(resolvedPattern === "hatch" ? { backgroundImage: HATCH_IMAGE } : null),
              ...style,
            }
          : style
      }
      {...props}
    >
      {children}
    </button>
  );
}
