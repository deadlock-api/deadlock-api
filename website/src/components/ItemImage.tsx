import type { Upgrade } from "deadlock_api_client";

import { AssetImage } from "~/components/AssetImage";
import { useItemById } from "~/hooks/useAssetById";
import { cn } from "~/lib/utils";

export function ItemImage({ itemId, className }: { itemId: number; className?: string }) {
  const { item, isLoading } = useItemById(itemId);

  return <ItemImageFromAsset item={item} isLoading={isLoading} className={className} />;
}

/** Use already-loaded assets in tables instead of subscribing once per image. */
export function ItemImageFromAsset({
  item,
  isLoading = false,
  className,
}: {
  item: Upgrade | undefined;
  isLoading?: boolean;
  className?: string;
}) {
  return (
    <AssetImage
      asset={
        item
          ? {
              webp: item.shop_image_webp,
              png: item.shop_image,
              fallbackSrc: item.shop_image_small,
              alt: item.name ?? "Unknown Item",
            }
          : undefined
      }
      isLoading={isLoading}
      skeletonClassName={cn("size-8", className)}
      emptyClassName={cn("aspect-square size-8 rounded bg-muted", className)}
      imgClassName={cn("aspect-square size-8", className)}
    />
  );
}
