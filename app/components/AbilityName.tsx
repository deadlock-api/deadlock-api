import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { cn } from "~/lib/utils";
import { abilitiesQueryOptions } from "~/queries/asset-queries";

export default function AbilityName({ abilityId, className }: { abilityId: number; className?: string }) {
  const { data } = useQuery(abilitiesQueryOptions);

  const ability = useMemo(() => data?.find((item) => item.id === abilityId), [data, abilityId]);

  return <span className={cn("truncate", className)}>{ability?.name}</span>;
}
