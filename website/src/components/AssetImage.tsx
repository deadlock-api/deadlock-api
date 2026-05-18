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
    <picture>
      {asset.webp && <source srcSet={asset.webp} type="image/webp" />}
      {asset.png && <source srcSet={asset.png} type="image/png" />}
      <img loading="lazy" src={src} alt={asset.alt} title={asset.title ?? asset.alt} className={imgClassName} />
    </picture>
  );
}
