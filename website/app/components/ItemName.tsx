import { useQuery } from "@tanstack/react-query";
import type { UpgradeV2 } from "assets_deadlock_api_client/api";
import { useMemo } from "react";
import { assetsApi } from "~/lib/assets-api";

export default function ItemName({ itemId, className }: { itemId: number; className?: string }) {
  const { data } = useQuery({
    queryKey: ["assets-items-upgrades"],
    queryFn: async () => {
      const response = await assetsApi.items_api.getItemsByTypeV2ItemsByTypeTypeGet({ type: "upgrade" });
      return response.data as UpgradeV2[];
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

  const item = useMemo(() => data?.find((item) => item.id === itemId), [data, itemId]);

  return <span className={className}>{item?.name}</span>;
}
