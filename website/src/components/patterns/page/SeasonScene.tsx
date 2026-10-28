import { cn } from "~/lib/utils";

/**
 * The seasonal sky behind the page: a moon in the end corner with clouds drifting past and a few bats before it, mist
 * along the bottom and now and then a far-off flicker of lightning. Render it next to the
 * `PageBackdrop`, before the `AppFrame`, so the glass panel blurs it into a glow. It draws nothing until a seasonal
 * theme (`.theme-halloween`) turns on `--season-display` and names its colors and images (effects.css, tokens.css).
 */
export function SeasonSky({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="season-sky"
      aria-hidden="true"
      className={cn("pointer-events-none fixed inset-0 overflow-hidden select-none", className)}
      {...props}
    >
      <div data-slot="season-sky-lightning" />
      <div data-slot="season-sky-fog" />
      <div data-slot="season-sky-moon" />
      <div data-slot="season-sky-cloud" />
      <div data-slot="season-sky-cloud" />
      <div data-slot="season-sky-bats" />
    </div>
  );
}

/**
 * What moves in front of the page now and then: bats crossing the top both ways, the witch on her broom, a ghost
 * rising from the bottom corner and eyes opening in the dark. `haunted` (while the visitor is idle) closes the dark in
 * from the edges and raises the witch from the bottom of the screen. Its children are the `SeasonPuff`s of clicks. All of it stays under the app bar, overlays and
 * every input (`pointer-events-none`). Render it after the `AppFrame`. Like `SeasonSky` it draws nothing outside a
 * seasonal theme, and nothing at all under `prefers-reduced-motion`.
 */
export function SeasonFlock({
  haunted = false,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { haunted?: boolean }) {
  return (
    <div
      data-slot="season-flock"
      data-haunted={haunted ? "" : undefined}
      aria-hidden="true"
      className={cn("pointer-events-none fixed inset-0 z-30 overflow-hidden select-none", className)}
      {...props}
    >
      <div data-slot="season-flock-bats" />
      <div data-slot="season-flock-bats-back" />
      <div data-slot="season-flock-witch" />
      <div data-slot="season-flock-ghost" />
      <div data-slot="season-flock-eyes" />
      <div data-slot="season-flock-haunt" />
      <div data-slot="season-flock-wisp" />
      <div data-slot="season-flock-wisp" />
      <div data-slot="season-flock-wisp" />
      <div data-slot="season-flock-wisp" />
      <div data-slot="season-flock-wisp" />
      <div data-slot="season-flock-wisp" />
      <div data-slot="season-flock-eyes" />
      <div data-slot="season-flock-eyes" />
      <div data-slot="season-flock-ghost" />
      {children}
    </div>
  );
}

/**
 * A little surprise where the visitor clicked, inside a `SeasonFlock`: a bat that flaps away, a ghost that floats up,
 * or a "Boo!" that pops. `x` and `y` are viewport pixels; it plays once and calls `onAnimationEnd`, so the owner can
 * drop it.
 */
export function SeasonPuff({
  kind = "bat",
  x = 0,
  y = 0,
  style,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & { kind?: "bat" | "ghost" | "boo"; x?: number; y?: number }) {
  return (
    <div
      data-slot="season-puff"
      data-kind={kind}
      style={{ "--puff-x": `${x}px`, "--puff-y": `${y}px`, ...style } as React.CSSProperties}
      {...props}
    >
      {kind === "boo" ? "Boo!" : null}
    </div>
  );
}
