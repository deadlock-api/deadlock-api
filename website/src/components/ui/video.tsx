import { cva, type VariantProps } from "class-variance-authority";

import { FOCUS_RING } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

const videoVariants = cva([FOCUS_RING, "block w-full min-w-0 bg-stage-dark object-contain"], {
  variants: {
    /** `video` holds a 16:9 box from the first frame, so loading the clip never moves the page; `auto` takes the clip's own. */
    aspect: {
      video: "aspect-video",
      auto: "",
    },
    /** `default` a block on its own, rounded like a card; `flush` inside a surface that already frames it. */
    shape: {
      default: "rounded-xl",
      flush: "rounded-none",
    },
  },
  defaultVariants: { aspect: "video", shape: "default" },
});

/**
 * A video clip with the browser's own controls, over a backdrop that stands in for the game world while it loads or
 * letterboxes. It plays inline on phones and only fetches its metadata until played. The controls seek anywhere and
 * replay as often as the viewer likes. Name it with `aria-label`; caption tracks are children.
 */
function Video({
  aspect = "video",
  shape = "default",
  controls = true,
  playsInline = true,
  preload = "metadata",
  className,
  children,
  ...props
}: React.ComponentProps<"video"> & VariantProps<typeof videoVariants>) {
  return (
    // oxlint-disable-next-line jsx-a11y/media-has-caption -- caption tracks arrive as children; gameplay footage without dialogue has none
    <video
      data-slot="video"
      controls={controls}
      playsInline={playsInline}
      preload={preload}
      className={cn(videoVariants({ aspect, shape }), className)}
      {...props}
    >
      {children}
    </video>
  );
}

export { Video };
