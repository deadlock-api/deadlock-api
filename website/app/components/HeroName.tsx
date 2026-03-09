import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Skeleton } from "~/components/ui/skeleton";
import { assetsApi } from "~/lib/assets-api";
import { cn } from "~/lib/utils";

export default function HeroName({ heroId, className }: { heroId: number; className?: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["assets-heroes"],
    queryFn: async () => {
      const response = await assetsApi.heroes_api.getHeroesV2HeroesGet({ onlyActive: true });
      return response.data;
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

  const hero = useMemo(() => data?.find((hero) => hero.id === heroId), [data, heroId]);

  if (isLoading) {
    return <Skeleton className={cn("h-4 w-20 inline-block", className)} />;
  }

  return <span className={cn("truncate", className)}>{hero?.name}</span>;
}
