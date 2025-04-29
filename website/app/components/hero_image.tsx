import { useQuery } from "@tanstack/react-query";
import { AssetsHero } from "~/types/assets_hero";
import { useMemo } from "react";

export default function HeroImage({ heroId }: { heroId: number }) {
  const { data } = useQuery<AssetsHero[]>({
    queryKey: ["assets-heroes"],
    queryFn: () => fetch("https://assets.deadlock-api.com/v2/heroes").then((res) => res.json()),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const hero = useMemo(() => data?.find((hero) => hero.id === heroId), [data, heroId]);

  return <img src={hero?.images?.minimap_image_webp} alt={hero?.name} title={hero?.name} width={36} height={36} />;
}
