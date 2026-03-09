import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";
import { heroesQueryOptions } from "~/queries/asset-queries";

export default function HeroImage({ heroId, className }: { heroId: number; className?: string }) {
  const { data, isLoading } = useQuery(heroesQueryOptions);

  const hero = useMemo(() => data?.find((hero) => hero.id === heroId), [data, heroId]);

  if (isLoading) {
    return <Skeleton className={cn("size-8 aspect-square rounded-full", className)} />;
  }

  if (!hero?.images?.minimap_image_webp && !hero?.images?.minimap_image) {
    return <div className={cn("size-8 aspect-square bg-muted rounded-full", className)} />;
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
        className={cn("size-8 aspect-square", className)}
      />
    </picture>
  );
}
