import { TONE_BG, toneOf } from "~/lib/tone";
import { cn } from "~/lib/utils";

/** A thin 0 to 1 bar beside a visible rate label, which it decorates. */
export function RateBar({
  rate,
  color,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "color" | "children"> & {
  rate: number | null;
  /** A CSS color for a bar that is a series rather than a good/bad rate: `var(--chart-4)`. Defaults to positive. */
  color?: string;
}) {
  return (
    <div
      data-slot="rate-bar"
      className={cn("relative h-1.5 min-w-0 rounded-full bg-muted", className)}
      aria-hidden="true"
      {...props}
    >
      {rate !== null && (
        <div
          className={cn("h-full rounded-full", !color && "bg-positive")}
          style={{ width: `${Math.max(0, Math.min(1, rate)) * 100}%`, backgroundColor: color }}
        />
      )}
    </div>
  );
}

/**
 * A signed value drawn from the middle of its track: right and positive for a gain, left and negative for a loss,
 * so the sign reads before the magnitude. `scale` is the value at which the bar reaches the edge.
 */
export function DivergingBar({
  value,
  scale,
  interval,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  value: number | null | undefined;
  scale: number;
  /** The uncertainty around the value, as `[low, high]` on the same scale. The value then becomes a marker. */
  interval?: readonly [number, number];
}) {
  const at = (n: number) => 50 + Math.max(-1, Math.min(1, n / scale)) * 50;
  const t = value == null || !Number.isFinite(value) || scale <= 0 ? 0 : Math.max(-1, Math.min(1, value / scale));
  return (
    <div
      data-slot="diverging-bar"
      className={cn("relative h-1.5 min-w-0 rounded-full bg-muted", className)}
      aria-hidden="true"
      {...props}
    >
      {interval ? (
        <>
          <div
            className="absolute inset-y-0 rounded-full bg-foreground/25"
            style={{ insetInlineStart: `${at(interval[0])}%`, width: `${at(interval[1]) - at(interval[0])}%` }}
          />
          <span
            className={cn(
              "absolute top-1/2 size-2.5 -translate-1/2 rounded-full border-2 border-background",
              TONE_BG[toneOf(t)],
            )}
            style={{ insetInlineStart: `${50 + t * 50}%` }}
          />
        </>
      ) : (
        <div
          className={cn("absolute inset-y-0 rounded-full", TONE_BG[toneOf(t)])}
          style={{ insetInlineStart: t >= 0 ? "50%" : `${50 + t * 50}%`, width: `${Math.abs(t) * 50}%` }}
        />
      )}
      <span className="absolute start-1/2 -top-0.5 h-2.5 w-px bg-foreground/40" />
    </div>
  );
}

/** Two sides of one whole, meeting where the shares say: allies against enemies, this lane against that one. */
export function SplitBar({
  left,
  right,
  leftColor = "var(--positive)",
  rightColor = "var(--negative)",
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  left: number;
  right: number;
  leftColor?: string;
  rightColor?: string;
}) {
  const total = left + right;
  const share = total > 0 ? left / total : 0.5;
  return (
    <div
      data-slot="split-bar"
      className={cn("relative flex h-1.5 min-w-0 gap-px overflow-hidden rounded-full bg-muted", className)}
      aria-hidden="true"
      {...props}
    >
      <div className="h-full opacity-70" style={{ width: `${share * 100}%`, backgroundColor: leftColor }} />
      <div className="h-full flex-1 opacity-70" style={{ backgroundColor: rightColor }} />
      <span className="absolute start-1/2 -top-0.5 h-2.5 w-px bg-foreground/60" />
    </div>
  );
}
