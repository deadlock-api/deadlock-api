import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";
import { abilitiesQueryOptions } from "~/queries/asset-queries";

export function AbilityImage({ abilityId, className }: { abilityId: number; className?: string }) {
  const { data, isLoading } = useQuery(abilitiesQueryOptions);

  const ability = useMemo(() => data?.find((item) => item.id === abilityId), [data, abilityId]);

  if (isLoading) {
    return <Skeleton className={cn("size-8 aspect-square rounded-full", className)} />;
  }

  if (!ability?.image_webp && !ability?.image) {
    return <div className={cn("size-8 aspect-square bg-muted rounded-full", className)} />;
  }

  return (
    <picture>
      {ability?.image_webp && <source srcSet={ability.image_webp} type="image/webp" />}
      {ability?.image && <source srcSet={ability.image} type="image/png" />}
      <img
        loading="lazy"
        src={ability?.image_webp ?? ability?.image ?? ""}
        alt={ability?.name ?? "Unknown Ability"}
        title={ability?.name ?? "Unknown Ability"}
        className={cn("size-8 aspect-square object-cover dark:brightness-0 dark:invert", className)}
      />
    </picture>
  );
}
