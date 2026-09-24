import { useId } from "react";

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
 * The children are the art; the frame owns the filter. The art needs a transparent background, or its silhouette is
 * its bounding box.
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
  // `url(#…)` takes the id as written, and React's ids carry characters a CSS url would need escaped.
  const filterId = `silhouette-${useId().replace(/[^\w-]/g, "")}`;
  return (
    <div
      data-slot="silhouette-frame"
      data-state={state}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the art is a child <img>; this box is the frame that names the whole, revealed or not
      role="img"
      aria-label={label ?? (state === "revealed" ? undefined : "Hidden art")}
      className={cn(
        "relative isolate inline-flex overflow-hidden",
        "[&_img]:transition-[filter,opacity] [&_img]:duration-slow",
        className,
      )}
      style={style}
      {...props}
    >
      {silhouetted && (
        // The fill takes the art's own outline (its alpha), so transparent pixels stay transparent; a filter or
        // overlay on the whole box painted the box itself, one solid square.
        <svg aria-hidden="true" width="0" height="0" className="absolute">
          <filter id={filterId} colorInterpolationFilters="sRGB">
            <feFlood style={{ floodColor: "var(--color-primary)" }} />
            <feComposite in2="SourceAlpha" operator="in" result="shape" />
            <feComposite in="SourceGraphic" in2="shape" operator="arithmetic" k2={shown} k3={1 - shown} />
          </filter>
        </svg>
      )}
      <span className="inline-flex size-full" style={{ filter: silhouetted ? `url(#${filterId})` : undefined }}>
        {children}
      </span>
    </div>
  );
}
