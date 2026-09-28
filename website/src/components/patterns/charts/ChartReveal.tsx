import { FOCUS_RING } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

/**
 * A small chart that turns into its numbers: hovering or focusing it cross-fades the plot (`ChartRevealFront`) into
 * its readings (`ChartRevealBack`) in the same box, so nothing around it moves or is covered. For small multiples,
 * where a floating tooltip would lie over the neighbouring plots.
 *
 * The tile is one tab stop. The back is hidden from assistive technology: the front's `ChartSurface` summary
 * (`announce="label"`) carries the same numbers.
 */
export function ChartReveal({
  className,
  ...props
}: React.ComponentProps<"figure"> & {
  /** Names the tile for the keyboard: "KDA ratio, where each player ranks". */
  "aria-label": string;
}) {
  return (
    <figure
      data-slot="chart-reveal"
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the tile reveals its readings on focus
      tabIndex={0}
      className={cn(FOCUS_RING, "group/reveal grid rounded-md *:[grid-area:1/1]", className)}
      {...props}
    />
  );
}

/** The plot, shown until the tile is hovered or focused. */
export function ChartRevealFront({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="chart-reveal-front"
      className={cn(
        "min-w-0 transition-opacity duration-normal ease-standard group-hover/reveal:opacity-0 group-focus-visible/reveal:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

/**
 * The readings, faded and slid in over the plot while the tile is hovered or focused. The front alone sizes the tile
 * (the back is size-contained), so a long list never makes a row of tiles taller; keep it short enough to fit.
 */
export function ChartRevealBack({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="chart-reveal-back"
      aria-hidden="true"
      className={cn(
        "pointer-events-none min-w-0 translate-y-1 overflow-hidden opacity-0 transition-[opacity,translate] duration-normal ease-standard contain-size group-hover/reveal:translate-y-0 group-hover/reveal:opacity-100 group-focus-visible/reveal:translate-y-0 group-focus-visible/reveal:opacity-100",
        className,
      )}
      {...props}
    />
  );
}
