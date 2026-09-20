import { Pause, Play } from "lucide-react";

import { DISABLED_STATE, FOCUS_RING } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

interface PlayButtonProps extends Omit<React.ComponentProps<"button">, "children"> {
  /** `playing` swaps the glyph for a pause mark, lights the glow and radiates a ring. */
  state?: "idle" | "playing";
  /** What is played, for assistive technology: "the mystery sound". */
  label?: string;
}

/**
 * The large round media button of a sound round. It is a real button with a visible glyph for both states, so the
 * glow is decoration rather than the only sign that something is playing.
 */
export function PlayButton({ state = "idle", label = "Play", className, ...props }: PlayButtonProps) {
  const Glyph = state === "playing" ? Pause : Play;
  return (
    // ds-allow raw-button: the round media control of a mini-game, sized and lit unlike any Button variant
    <button
      type="button"
      data-slot="play-button"
      data-state={state}
      aria-label={state === "playing" ? `Pause ${label}` : `Play ${label}`}
      aria-pressed={state === "playing"}
      className={cn(
        "relative inline-flex size-20 shrink-0 cursor-pointer items-center justify-center rounded-full border border-primary/40",
        "bg-primary/15 text-primary transition-all duration-normal [&_svg]:size-8",
        FOCUS_RING,
        "hover:bg-primary/25",
        DISABLED_STATE,
        state === "playing" && "shadow-glow-primary",
        className,
      )}
      {...props}
    >
      {state === "playing" && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 animate-ping rounded-full border border-primary/40 motion-reduce:animate-none"
        />
      )}
      <Glyph aria-hidden="true" />
    </button>
  );
}
