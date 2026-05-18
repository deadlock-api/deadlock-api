import { AssetImage } from "~/components/AssetImage";
import { useHeroById } from "~/hooks/useAssetById";
import { cn } from "~/lib/utils";

export function HeroImage({ heroId, className }: { heroId: number; className?: string }) {
  const { hero, isLoading } = useHeroById(heroId);

  return (
    <AssetImage
      asset={
        hero
          ? {
              webp: hero.images?.minimap_image_webp,
              png: hero.images?.minimap_image,
              fallbackSrc: hero.images?.minimap_image_webp ?? hero.images?.minimap_image,
              alt: hero.name ?? "Unknown Hero",
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
