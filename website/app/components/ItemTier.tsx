import { useQuery } from "@tanstack/react-query";
import type { UpgradeV2 } from "assets-deadlock-api-client/api";
import { useMemo } from "react";
import { assetsApi } from "~/lib/assets-api";

export default function ItemTier({ itemId }: { itemId: number }) {
  const { data } = useQuery({
    queryKey: ["assets-items-upgrades"],
    queryFn: async () => {
      const response = await assetsApi.items_api.getItemsByTypeV2ItemsByTypeTypeGet({ type: "upgrade" });
      return response.data as UpgradeV2[];
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

  const item = useMemo(() => data?.find((item) => item.id === itemId), [data, itemId]);
  return <>{item?.item_tier}</>;
}
