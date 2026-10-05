import { AlertTriangle, Play, Square } from "lucide-react";

import { Button } from "~/components/ui/button";
import type { SoundState } from "~/components/ui/hooks/use-sound-player";
import { cn } from "~/lib/utils";

const VARIANT = {
  idle: "subtle",
  loading: "subtle",
  playing: "soft",
  error: "destructive-soft",
} as const;

const ACTION = { idle: "Play", loading: "Loading", playing: "Stop", error: "Retry" } as const;

interface SoundButtonProps extends Omit<React.ComponentProps<typeof Button>, "variant" | "loading" | "aria-label"> {
  /** From `useSoundPlayer().stateOf(id)`. */
  state?: SoundState;
  /** What it plays, for assistive technology: "kill Trapper, take 2". The action is put in front of it. */
  label: string;
  /** Seconds the playing clip lasts: a fill runs along the bottom edge over that time. */
  duration?: number;
}

/**
 * Plays one clip or a sequence, and stops it while it plays. Each state has its own glyph (play, spinner, stop,
 * warning), so none is told by color alone; it is a toggle (`aria-pressed`) and names its action and the clip.
 * Children are a short visible label, such as the take number; without children it is an icon button.
 */
export function SoundButton({
  state = "idle",
  label,
  duration,
  size,
  className,
  style,
  children,
  ...props
}: SoundButtonProps) {
  const playing = state === "playing";
  const Glyph = playing ? Square : state === "error" ? AlertTriangle : Play;
  return (
    <Button
      data-slot="sound-button"
      data-state={state}
      variant={VARIANT[state]}
      size={size ?? (children === undefined ? "icon-xs" : "xs")}
      loading={state === "loading"}
      loadingLabel={`Loading ${label}`}
      aria-pressed={playing}
      aria-label={`${ACTION[state]} ${label}`}
      className={cn("relative overflow-hidden tabular-nums", className)}
      style={duration ? ({ "--sound-duration": `${duration}s`, ...style } as React.CSSProperties) : style}
      {...props}
    >
      {state !== "loading" && <Glyph aria-hidden="true" className={cn(playing && "fill-current")} />}
      {children}
      {playing && duration ? (
        <span
          data-slot="sound-button-progress"
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-primary"
        />
      ) : null}
    </Button>
  );
}
