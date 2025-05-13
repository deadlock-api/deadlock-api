import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { AssetsItem } from "~/types/assets_item";

export default function ItemImage({ itemId }: { itemId: number }) {
  const { data } = useQuery<AssetsItem[]>({
    queryKey: ["assets-items-upgrades"],
    queryFn: () => fetch("https://assets.deadlock-api.com/v2/items/by-type/upgrade").then((res) => res.json()),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const item = useMemo(() => data?.find((item) => item.id === itemId), [data, itemId]);

  return (
    <img loading="lazy" src={item?.shop_image_small_webp} alt={item?.name} title={item?.name} width={36} height={36} />
  );
}
