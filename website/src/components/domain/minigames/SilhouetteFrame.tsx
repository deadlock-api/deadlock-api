import { cn } from "~/lib/utils";

/** How far the art is blurred while nothing of a `blur` round is shown yet. */
const HIDDEN_BLUR_PX = 20;

interface SilhouetteFrameProps extends React.ComponentProps<"div"> {
  /** `hidden` paints the art as one brand-colored shape; `revealed` lets its own colors back in. */
  state?: "hidden" | "revealed";
  /** How the art is hidden: flattened to a brand silhouette, or kept in its own colors behind blur. */
  mode?: "silhouette" | "blur";
  /** How much of the art shows through while a round is being narrowed down, 0 to 1. */
  reveal?: number;
  /** A CSS filter for the art, such as a round's own SVG warp: `url(#warp-2)`. Replaces the filter of the mode. */
  filter?: string;
  /** What the art is, once it is revealed. While hidden the frame announces itself as a mystery. */
  label?: string;
}

/**
 * Mystery art: the image is hidden behind a solid brand silhouette or behind blur, and comes back to itself as the
 * round is solved. The children are the art; the frame owns the filter and its transition.
 */
export function SilhouetteFrame({
  state = "hidden",
  mode = "silhouette",
  reveal,
  filter,
  label,
  className,
  style,
  children,
  ...props
}: SilhouetteFrameProps) {
  const shown = state === "revealed" ? 1 : Math.max(0, Math.min(1, reveal ?? 0));
  const silhouetted = mode === "silhouette" && shown < 1;
  // `filter` outranks the mode, so a round that brings its own effect still uses `state` / `reveal` for the frame.
  const artFilter = filter ?? (mode === "blur" ? `blur(${(1 - shown) * HIDDEN_BLUR_PX}px)` : undefined);
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
      {artFilter === undefined ? (
        children
      ) : (
        <span
          className="inline-flex transition-[filter] duration-slow motion-reduce:transition-none"
          style={{ filter: artFilter }}
        >
          {children}
        </span>
      )}
    </div>
  );
}
