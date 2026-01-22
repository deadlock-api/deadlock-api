import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { assetsApi } from "~/lib/assets-api";
import { cn } from "~/lib/utils";

export default function HeroImage({ heroId, className }: { heroId: number; className?: string }) {
  const { data } = useQuery({
    queryKey: ["assets-heroes"],
    queryFn: async () => {
      const response = await assetsApi.heroes_api.getHeroesV2HeroesGet({ onlyActive: true });
      return response.data;
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

  const hero = useMemo(() => data?.find((hero) => hero.id === heroId), [data, heroId]);

  return (
    <picture>
      {hero?.images?.minimap_image_webp && <source srcSet={hero?.images?.minimap_image_webp} type="image/webp" />}
      {hero?.images?.minimap_image && <source srcSet={hero?.images?.minimap_image} type="image/png" />}
      <img
        loading="lazy"
        src={hero?.images?.minimap_image_webp ?? ""} // Fallback for browsers that don't support <picture> or neither format
        alt={hero?.name}
        title={hero?.name}
        className={cn("size-8 aspect-square", className)}
      />
    </picture>
  );
}
