import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { AssetsItem } from "~/types/assets_item";
import { cn } from "../lib/utils";

export default function ItemImage({ itemId, className }: { itemId: number; className?: string }) {
  const { data } = useQuery<AssetsItem[]>({
    queryKey: ["assets-items-upgrades"],
    queryFn: () => fetch("https://assets.deadlock-api.com/v2/items/by-type/upgrade").then((res) => res.json()),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const item = useMemo(() => data?.find((item) => item.id === itemId), [data, itemId]);

  return (
    <picture>
      <source srcSet={item?.shop_image_small_webp} type="image/webp" />
      <source srcSet={item?.shop_image_small} type="image/png" />
      <img
        loading="lazy"
        src={item?.shop_image_small} // Fallback for browsers that don't support <picture> or neither format
        alt={item?.name}
        title={item?.name}
        className={cn("size-6", className)}
      />
    </picture>
  );
}
