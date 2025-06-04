import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Skeleton } from "~/components/ui/skeleton";
import { ASSETS_ORIGIN } from "~/lib/constants";
import type { AssetsItem } from "~/types/assets_item";
import { cn } from "../lib/utils";

export default function ItemImage({ itemId, className }: { itemId: number; className?: string }) {
  const { data, isLoading } = useQuery<AssetsItem[]>({
    queryKey: ["assets-items-upgrades"],
    queryFn: () => fetch(new URL("/v2/items/by-type/upgrade", ASSETS_ORIGIN)).then((res) => res.json()),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const item = useMemo(() => data?.find((item) => item.id === itemId), [data, itemId]);

  if (isLoading) {
    return <Skeleton className={cn("size-8", className)} />;
  }

  if (!item) {
    return <div>ENOITEM</div>;
  }

  if (!item?.shop_image_small_webp) {
    return <div>ENOIMG</div>;
  }

  return (
    <picture>
      <source srcSet={item?.shop_image_small_webp} type="image/webp" />
      <source srcSet={item?.shop_image_small} type="image/png" />
      <img
        loading="lazy"
        src={item?.shop_image_small} // Fallback for browsers that don't support <picture> or neither format
        alt={item?.name}
        title={item?.name}
        className={cn("size-8 aspect-square", className)}
      />
    </picture>
  );
}
