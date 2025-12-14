import { useQuery } from "@tanstack/react-query";
import type { UpgradeV2 } from "assets_deadlock_api_client/api";
import { useMemo } from "react";
import { Skeleton } from "~/components/ui/skeleton";
import { assetsApi } from "~/lib/assets-api";
import { cn } from "~/lib/utils";

export default function ItemImage({ itemId, className }: { itemId: number; className?: string }) {
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
      {item?.shop_image_small_webp && <source srcSet={item?.shop_image_small_webp} type="image/webp" />}
      {item?.shop_image_small && <source srcSet={item?.shop_image_small} type="image/png" />}
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
