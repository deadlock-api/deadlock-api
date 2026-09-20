import { cn } from "~/lib/utils";

interface StaleOverlayProps extends React.ComponentProps<"div"> {
  /** The content on screen is the previous answer and a new one is on its way. */
  active?: boolean;
  /** What is being refetched, for assistive technology: "hero stats". */
  label?: string;
}

/**
 * Keeps the last answer on screen while the next one loads, washed out and announced busy. It is the alternative to
 * a spinner that throws away what the reader was already looking at; the content stays selectable and scrollable.
 */
export function StaleOverlay({ active = false, label = "content", className, children, ...props }: StaleOverlayProps) {
  return (
    <div
      data-slot="stale-overlay"
      data-state={active ? "stale" : "fresh"}
      aria-busy={active || undefined}
      className={cn(
        "transition-opacity duration-normal",
        active && "pointer-events-none opacity-60 blur-hairline saturate-50",
        className,
      )}
      {...props}
    >
      {active && <output className="sr-only">Updating {label}</output>}
      {children}
    </div>
  );
}
