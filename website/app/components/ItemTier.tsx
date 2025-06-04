import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ASSETS_ORIGIN } from "~/lib/constants";
import type { AssetsItem } from "~/types/assets_item";

export default function ItemTier({ itemId }: { itemId: number }) {
  const { data } = useQuery<AssetsItem[]>({
    queryKey: ["assets-items-upgrades"],
    queryFn: () => fetch(new URL("/v2/items/by-type/upgrade", ASSETS_ORIGIN)).then((res) => res.json()),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const item = useMemo(() => data?.find((item) => item.id === itemId), [data, itemId]);

  return <>{item?.item_tier}</>;
}
