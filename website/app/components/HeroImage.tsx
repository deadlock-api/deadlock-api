import { Skeleton } from "~/components/ui/skeleton";
import { useHeroById } from "~/hooks/useAssetById";
import { cn } from "~/lib/utils";

export function HeroImage({ heroId, className }: { heroId: number; className?: string }) {
  const { hero, isLoading } = useHeroById(heroId);

  if (isLoading) {
    return <Skeleton className={cn("aspect-square size-8 rounded-full", className)} />;
  }

  if (!hero?.images?.minimap_image_webp && !hero?.images?.minimap_image) {
    return <div className={cn("aspect-square size-8 rounded-full bg-muted", className)} />;
  }

  return (
    <picture>
      {hero?.images?.minimap_image_webp && <source srcSet={hero?.images?.minimap_image_webp} type="image/webp" />}
      {hero?.images?.minimap_image && <source srcSet={hero?.images?.minimap_image} type="image/png" />}
      <img
        loading="lazy"
        src={hero?.images?.minimap_image_webp ?? hero?.images?.minimap_image ?? ""}
        alt={hero?.name ?? "Unknown Hero"}
        title={hero?.name ?? "Unknown Hero"}
        className={cn("aspect-square size-8", className)}
      />
    </picture>
  );
}
