import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { cn } from "~/lib/utils";
import { abilitiesQueryOptions } from "~/queries/asset-queries";

export default function AbilityImage({ abilityId, className }: { abilityId: number; className?: string }) {
  const { data } = useQuery(abilitiesQueryOptions);

  const ability = useMemo(() => data?.find((item) => item.id === abilityId), [data, abilityId]);

  return (
    <picture>
      {ability?.image_webp && <source srcSet={ability.image_webp} type="image/webp" />}
      {ability?.image && <source srcSet={ability.image} type="image/png" />}
      <img
        loading="lazy"
        src={ability?.image_webp ?? ability?.image ?? ""}
        alt={ability?.name}
        title={ability?.name}
        className={cn("size-8 aspect-square object-cover dark:brightness-0 dark:invert", className)}
      />
    </picture>
  );
}
