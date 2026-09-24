import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";

interface AssetImageData {
  webp?: string | null;
  png?: string | null;
  fallbackSrc?: string | null;
  alt: string;
  title?: string;
}

interface AssetImageProps extends Omit<React.ComponentProps<"img">, "src" | "alt" | "title" | "loading"> {
  asset: AssetImageData | undefined;
  loading?: boolean;
  /** `dim` quiets art that is context rather than the subject: a slot that is not this build's pick. */
  emphasis?: "normal" | "dim";
  /**
   * `grayscale` drains the art of its own colors while they would give an answer away (an item's slot color in a quiz);
   * back to `full`, they return.
   */
  palette?: "full" | "grayscale";
  /** Sizes and shapes the box that stands in for the image while it loads and when there is no art. */
  placeholderClassName?: string;
}

export function AssetImage({
  asset,
  loading = false,
  emphasis = "normal",
  palette = "full",
  className,
  placeholderClassName,
  ...props
}: AssetImageProps) {
  if (loading) {
    return <Skeleton className={placeholderClassName} />;
  }

  if (!asset?.webp && !asset?.png) {
    return <div className={cn("bg-muted", placeholderClassName)} />;
  }

  const src = asset.fallbackSrc ?? asset.webp ?? asset.png ?? "";

  return (
    // Sizing lands on the <img>, so the <picture> must not be a flex/grid item itself: its unstyled
    // box would collapse and preflight's `img { max-width: 100% }` would squash the art to fit.
    <picture className="contents">
      {/* `display: contents` promotes these to layout children, and preflight leaves <source> as
          `inline` rather than the UA sheet's `none`, so each portrait would count as three grid
          items. Resource selection is unaffected by CSS display. */}
      {asset.webp && <source className="hidden" srcSet={asset.webp} type="image/webp" />}
      {asset.png && <source className="hidden" srcSet={asset.png} type="image/png" />}
      <img
        loading="lazy"
        src={src}
        alt={asset.alt}
        title={asset.title ?? asset.alt}
        data-emphasis={emphasis}
        data-palette={palette}
        {...props}
        className={cn(
          "transition-[filter] duration-slow ease-standard motion-reduce:transition-none",
          emphasis === "dim" && "opacity-40 saturate-50",
          palette === "grayscale" && "grayscale",
          className,
        )}
      />
    </picture>
  );
}
