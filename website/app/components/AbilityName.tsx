import { useQuery } from "@tanstack/react-query";
import type { AbilityV2 } from "assets_deadlock_api_client/api";
import { useMemo } from "react";
import { assetsApi } from "~/lib/assets-api";
import { cn } from "~/lib/utils";

export default function AbilityName({ abilityId, className }: { abilityId: number; className?: string }) {
  const { data } = useQuery({
    queryKey: ["assets-items-abilities"],
    queryFn: async () => {
      const response = await assetsApi.items_api.getItemsByTypeV2ItemsByTypeTypeGet({ type: "ability" });
      return response.data as AbilityV2[];
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

  const ability = useMemo(() => data?.find((item) => item.id === abilityId), [data, abilityId]);

  return <span className={cn("truncate", className)}>{ability?.name}</span>;
}
