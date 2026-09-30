import { cva, type VariantProps } from "class-variance-authority";
import { useState } from "react";

import { useLoadedImageRef } from "~/components/ui/hooks/use-loaded-image-ref";
import { cn } from "~/lib/utils";

const pixelStageVariants = cva("flex min-w-0 items-center-safe justify-center-safe overflow-hidden border", {
  variants: {
    /**
     * What stands behind the art: `game` a scene from the game; `neutral` mid grey shows light and dark art alike;
     * `light` and `dark` test one against its worst case.
     */
    backdrop: {
      game: "bg-stage-game",
      neutral: "bg-stage-neutral",
      light: "bg-stage-light",
      dark: "bg-stage-dark",
    },
    /** `default` a stage to look at the art on; `sm` a square thumbnail beside a list row's label. */
    size: {
      default: "min-h-24 rounded-lg p-4",
      sm: "size-10 shrink-0 rounded-md p-1",
    },
  },
  defaultVariants: { backdrop: "neutral", size: "default" },
});

/**
 * A backdrop that stands in for the game world behind a small piece of HUD art (a crosshair), with the art centred on
 * it. The child is a `PixelImage`. It never scrolls: an image wider than the stage shrinks to fit.
 */
function PixelStage({
  backdrop = "neutral",
  size = "default",
  className,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof pixelStageVariants>) {
  return (
    <div
      data-slot="pixel-stage"
      data-backdrop={backdrop}
      data-size={size}
      className={cn(pixelStageVariants({ backdrop, size }), className)}
      {...props}
    />
  );
}

/**
 * Pixel art at a whole multiple of its own size, each source pixel drawn as a crisp square (`image-rendering:
 * pixelated`). `scale` 1 is its true size in CSS pixels. The size is read from the image once it has loaded, so until
 * then it shows at 1x; it never grows past its container.
 */
function PixelImage({
  scale = 1,
  alt = "",
  className,
  style,
  ref,
  onLoad,
  ...props
}: React.ComponentProps<"img"> & {
  /** How many screen pixels each image pixel takes on each side. */
  scale?: number;
}) {
  const [naturalWidth, setNaturalWidth] = useState<number>();
  const imgRef = useLoadedImageRef(ref, (img) => setNaturalWidth(img.naturalWidth || undefined));
  return (
    <img
      data-slot="pixel-image"
      ref={imgRef}
      alt={alt}
      onLoad={(event) => {
        setNaturalWidth(event.currentTarget.naturalWidth);
        onLoad?.(event);
      }}
      className={cn("block h-auto max-w-full shrink-0 rendering-pixelated", className)}
      style={naturalWidth ? { width: naturalWidth * scale, ...style } : style}
      {...props}
    />
  );
}

export { PixelImage, PixelStage };
