import { AssetImage } from "~/components/domain/assets/AssetImage";
import { useItemById } from "~/hooks/useAssetById";
import { cn } from "~/lib/utils";
import type { SlimUpgrade } from "~/queries/asset-queries";

export type ItemSource =
  | { itemId: number; item?: never; loading?: never }
  | { item: SlimUpgrade | undefined; loading?: boolean; itemId?: never };

type ItemImageLook = Omit<
  React.ComponentProps<typeof AssetImage>,
  "asset" | "loading" | "title" | "placeholderClassName"
> & {
  /** Native hover title, the name by default; pass "" where a tooltip already names the image. */
  title?: string;
};

/** Pass `item` to use already-loaded assets in tables instead of subscribing once per image. */
export function ItemImage(props: ItemImageLook & ItemSource) {
  return props.itemId !== undefined ? <ItemImageById {...props} /> : <ItemImageView {...props} />;
}

function ItemImageById({ itemId, ...props }: ItemImageLook & { itemId: number }) {
  const { item, isLoading } = useItemById(itemId);

  return <ItemImageView {...props} item={item} loading={isLoading} />;
}

function ItemImageView({
  item,
  loading,
  className,
  title,
  ...props
}: ItemImageLook & { item: SlimUpgrade | undefined; loading?: boolean }) {
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
      {...props}
      loading={loading}
      placeholderClassName={cn("aspect-square size-8 rounded-sm", className)}
      className={cn("aspect-square size-8 rounded-sm", className)}
    />
  );
}
