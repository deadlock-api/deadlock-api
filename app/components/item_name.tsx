import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { AssetsItem } from "~/types/assets_item";

export default function ItemName({ itemId }: { itemId: number }) {
  const { data } = useQuery<AssetsItem[]>({
    queryKey: ["assets-items-upgrades"],
    queryFn: () => fetch("https://assets.deadlock-api.com/v2/items/by-type/upgrade").then((res) => res.json()),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const item = useMemo(() => data?.find((item) => item.id === itemId), [data, itemId]);

  return <>{item?.name}</>;
}
