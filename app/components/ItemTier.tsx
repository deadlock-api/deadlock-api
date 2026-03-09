import { useQuery } from "@tanstack/react-query";
import type { UpgradeV2 } from "assets_deadlock_api_client/api";
import { useMemo } from "react";
import { Skeleton } from "~/components/ui/skeleton";
import { assetsApi } from "~/lib/assets-api";

export default function ItemTier({ itemId }: { itemId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["assets-items-upgrades"],
    queryFn: async () => {
      const response = await assetsApi.items_api.getItemsByTypeV2ItemsByTypeTypeGet({ type: "upgrade" });
      return response.data as UpgradeV2[];
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

  const item = useMemo(() => data?.find((item) => item.id === itemId), [data, itemId]);

  if (isLoading) {
    return <Skeleton className="h-4 w-4 inline-block" />;
  }

  return <>{item?.item_tier}</>;
}
