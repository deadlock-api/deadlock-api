import type { Upgrade } from "deadlock_api_client";

import { AssetImage } from "~/components/domain/assets/AssetImage";
import { useItemById } from "~/hooks/useAssetById";
import { cn } from "~/lib/utils";

export function ItemImage({
  itemId,
  className,
  ...props
}: Omit<React.ComponentProps<typeof ItemImageFromAsset>, "item" | "loading" | "isLoading"> & { itemId: number }) {
  const { item, isLoading } = useItemById(itemId);

  return <ItemImageFromAsset item={item} loading={isLoading} className={className} {...props} />;
}

/** Use already-loaded assets in tables instead of subscribing once per image. */
export function ItemImageFromAsset({
  item,
  loading,
  className,
  title,
  ...props
}: Omit<React.ComponentProps<typeof AssetImage>, "asset" | "loading" | "title"> & {
  item: Upgrade | undefined;
  loading?: boolean;
  className?: string;
  /** Native hover title, the name by default; pass "" where a tooltip already names the image. */
  title?: string;
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
              title,
            }
          : undefined
      }
      loading={loading}
      skeletonClassName={cn("size-8 rounded-sm", className)}
      emptyClassName={cn("aspect-square size-8 rounded-sm bg-muted", className)}
      imgClassName={cn("aspect-square size-8 rounded-sm", className)}
      {...props}
    />
  );
}
