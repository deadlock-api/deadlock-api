import { cn } from "~/lib/utils";

interface StateFlashProps extends Omit<React.ComponentProps<"div">, "children"> {
  /** What just happened. `none` draws nothing, so the flash can stay mounted between rounds. */
  state?: "none" | "correct" | "wrong";
}

/**
 * The full-bleed wash a mini-game shows the moment an answer lands. It is decoration on top of an answer the game
 * has already stated in words, so it is hidden from assistive technology, and it collapses under reduced motion.
 */
export function StateFlash({ state = "none", className, ...props }: StateFlashProps) {
  if (state === "none") return null;
  return (
    <div
      data-slot="state-flash"
      data-state={state}
      aria-hidden="true"
      className={cn(
        "pointer-events-none fixed inset-0 z-50 animate-out duration-slow fade-out motion-reduce:animate-none",
        state === "correct" ? "bg-positive/20" : "bg-negative/20",
        className,
      )}
      {...props}
    />
  );
}
