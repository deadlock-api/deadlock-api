import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { assetsApi } from "~/lib/assets-api";
import { cn } from "~/lib/utils";

export default function HeroName({ heroId, className }: { heroId: number; className?: string }) {
  const { data } = useQuery({
    queryKey: ["assets-heroes"],
    queryFn: async () => {
      const response = await assetsApi.heroes_api.getHeroesV2HeroesGet({ onlyActive: true });
      return response.data;
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

  const hero = useMemo(() => data?.find((hero) => hero.id === heroId), [data, heroId]);

  return <span className={cn("truncate", className)}>{hero?.name}</span>;
}
