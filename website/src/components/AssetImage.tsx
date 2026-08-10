import { Skeleton } from "~/components/ui/skeleton";

export interface AssetImageData {
  webp?: string | null;
  png?: string | null;
  fallbackSrc?: string | null;
  alt: string;
  title?: string;
}

export interface AssetImageProps {
  asset: AssetImageData | undefined;
  isLoading: boolean;
  skeletonClassName?: string;
  emptyClassName?: string;
  imgClassName?: string;
}

export function AssetImage({ asset, isLoading, skeletonClassName, emptyClassName, imgClassName }: AssetImageProps) {
  if (isLoading) {
    return <Skeleton className={skeletonClassName} />;
  }

  if (!asset?.webp && !asset?.png) {
    return <div className={emptyClassName} />;
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
      <img loading="lazy" src={src} alt={asset.alt} title={asset.title ?? asset.alt} className={imgClassName} />
    </picture>
  );
}
