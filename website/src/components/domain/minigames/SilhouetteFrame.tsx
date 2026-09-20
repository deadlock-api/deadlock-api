import { cn } from "~/lib/utils";

interface SilhouetteFrameProps extends React.ComponentProps<"div"> {
  /** `hidden` paints the art as one brand-colored shape; `revealed` lets its own colors back in. */
  state?: "hidden" | "revealed";
  /** How much of the art shows through while a round is being narrowed down, 0 to 1. */
  reveal?: number;
  /** What the art is, once it is revealed. While hidden the frame announces itself as a mystery. */
  label?: string;
}

/**
 * Mystery art: the image is hidden behind a solid brand silhouette, and comes back to itself as the round is solved.
 * The children are the art; the frame owns the filter and its transition.
 */
export function SilhouetteFrame({
  state = "hidden",
  reveal,
  label,
  className,
  style,
  children,
  ...props
}: SilhouetteFrameProps) {
  const shown = state === "revealed" ? 1 : Math.max(0, Math.min(1, reveal ?? 0));
  const silhouetted = shown < 1;
  return (
    <div
      data-slot="silhouette-frame"
      data-state={state}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the art is a child <img>; this box is the frame that names the whole, revealed or not
      role="img"
      aria-label={label ?? (state === "revealed" ? undefined : "Hidden art")}
      className={cn(
        "relative isolate inline-flex overflow-hidden transition-[filter,opacity] duration-slow motion-reduce:transition-none",
        "[&_img]:transition-[filter,opacity] [&_img]:duration-slow",
        className,
      )}
      style={{
        // A brightness of 0 collapses the art to black; the brand fill is then laid over it through the mask.
        filter: silhouetted ? `brightness(${shown}) contrast(${1 + (1 - shown)})` : undefined,
        ...style,
      }}
      {...props}
    >
      {silhouetted && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 bg-primary mix-blend-color"
          style={{ opacity: 1 - shown }}
        />
      )}
      {children}
    </div>
  );
}
