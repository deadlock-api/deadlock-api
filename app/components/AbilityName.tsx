import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";
import { abilitiesQueryOptions } from "~/queries/asset-queries";

export function AbilityName({ abilityId, className }: { abilityId: number; className?: string }) {
  const { data, isLoading } = useQuery(abilitiesQueryOptions);

  const ability = useMemo(() => data?.find((item) => item.id === abilityId), [data, abilityId]);

  if (isLoading) {
    return <Skeleton className={cn("h-4 w-20 inline-block", className)} />;
  }

  return <span className={cn("truncate", className)}>{ability?.name ?? "Unknown Ability"}</span>;
}
