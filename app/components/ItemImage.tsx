import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";
import { itemUpgradesQueryOptions } from "~/queries/asset-queries";

export default function ItemImage({ itemId, className }: { itemId: number; className?: string }) {
  const { data, isLoading } = useQuery(itemUpgradesQueryOptions);

  const item = useMemo(() => data?.find((item) => item.id === itemId), [data, itemId]);

  if (isLoading) {
    return <Skeleton className={cn("size-8", className)} />;
  }

  if (!item || !item.shop_image_webp) {
    return <div className={cn("size-8 aspect-square bg-muted rounded", className)} />;
  }

  return (
    <picture>
      {item?.shop_image_webp && <source srcSet={item?.shop_image_webp} type="image/webp" />}
      {item?.shop_image && <source srcSet={item?.shop_image} type="image/png" />}
      <img
        loading="lazy"
        src={item?.shop_image_small ?? ""} // Fallback for browsers that don't support <picture> or neither format
        alt={item?.name}
        title={item?.name}
        className={cn("size-8 aspect-square", className)}
      />
    </picture>
  );
}
