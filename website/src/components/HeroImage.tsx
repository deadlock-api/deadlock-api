import { AssetImage } from "~/components/AssetImage";
import { useHeroById } from "~/hooks/useAssetById";
import { cn } from "~/lib/utils";
import type { SlimHero } from "~/queries/asset-queries";

export function HeroImage({
  heroId,
  className,
  title,
}: {
  heroId: number;
  className?: string;
  /** Native hover title, the name by default; pass "" where a tooltip already names the image. */
  title?: string;
}) {
  const { hero, isLoading } = useHeroById(heroId);

  return <HeroImageFromAsset hero={hero} isLoading={isLoading} className={className} title={title} />;
}

/** Render a hero already read by the parent without another query subscription. */
export function HeroImageFromAsset({
  hero,
  isLoading = false,
  className,
  title,
}: {
  hero: SlimHero | undefined;
  isLoading?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <AssetImage
      asset={
        hero
          ? {
              webp: hero.images?.minimap_image_webp,
              png: hero.images?.minimap_image,
              fallbackSrc: hero.images?.minimap_image_webp ?? hero.images?.minimap_image,
              alt: hero.name ?? "Unknown Hero",
              title,
            }
          : undefined
      }
      isLoading={isLoading}
      skeletonClassName={cn("aspect-square size-8 rounded-full", className)}
      emptyClassName={cn("aspect-square size-8 rounded-full bg-muted", className)}
      imgClassName={cn("aspect-square size-8", className)}
    />
  );
}
