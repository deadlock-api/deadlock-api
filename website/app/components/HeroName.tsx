import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";
import { heroesQueryOptions } from "~/queries/asset-queries";

export function HeroName({ heroId, className }: { heroId: number; className?: string }) {
  const { data, isLoading } = useQuery(heroesQueryOptions);

  const hero = useMemo(() => data?.find((hero) => hero.id === heroId), [data, heroId]);

  if (isLoading) {
    return <Skeleton className={cn("h-4 w-20 inline-block", className)} />;
  }

  return <span className={cn("truncate", className)}>{hero?.name ?? "Unknown Hero"}</span>;
}
