import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { AssetsHero } from "~/types/assets_hero";

export default function HeroName({ heroId }: { heroId: number }) {
  const { data } = useQuery<AssetsHero[]>({
    queryKey: ["assets-heroes"],
    queryFn: () => fetch("https://assets.deadlock-api.com/v2/heroes").then((res) => res.json()),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const hero = useMemo(() => data?.find((hero) => hero.id === heroId), [data, heroId]);

  return <>{hero?.name}</>;
}
