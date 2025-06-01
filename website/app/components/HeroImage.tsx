import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { cn } from "~/lib/utils";
import type { AssetsHero } from "~/types/assets_hero";

export default function HeroImage({ heroId, className }: { heroId: number; className?: string }) {
  const { data } = useQuery<AssetsHero[]>({
    queryKey: ["assets-heroes"],
    queryFn: () => fetch("https://assets.deadlock-api.com/v2/heroes?only_active=true").then((res) => res.json()),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const hero = useMemo(() => data?.find((hero) => hero.id === heroId), [data, heroId]);

  return (
    <picture>
      <source srcSet={hero?.images?.minimap_image_webp} type="image/webp" />
      <source srcSet={hero?.images?.minimap_image} type="image/png" />
      <img
        loading="lazy"
        src={hero?.images?.minimap_image_webp}
        alt={hero?.name}
        title={hero?.name}
        className={cn("size-8 aspect-square", className)}
      />
    </picture>
  );
}
