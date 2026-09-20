import { cva, type VariantProps } from "class-variance-authority";
import type { Upgrade } from "deadlock_api_client";

import { ItemImage, type ItemSource } from "~/components/domain/assets/ItemImage";
import { ItemName } from "~/components/domain/assets/ItemName";
import { useItemById } from "~/hooks/useAssetById";
import { cn } from "~/lib/utils";

const itemCellVariants = cva("flex min-w-0 items-center", {
  variants: { size: { sm: "gap-1.5", default: "gap-2" } },
  defaultVariants: { size: "default" },
});

const IMAGE_SIZE = { sm: "size-6", default: "size-8" } as const;

type ItemCellProps = Omit<React.ComponentProps<"span">, "children"> &
  VariantProps<typeof itemCellVariants> & {
    /** Links the name to the item's analytics page. */
    linkToDetail?: boolean;
  };

/**
 * A shop item as the identity of a row: icon and name on one line. The name truncates to the width the parent leaves
 * (cap it with a `max-w-*` on the cell); the text size is the parent's.
 *
 * Pass `item` to render an item already read by the parent: a long table then holds one subscription, not one per row.
 */
export function ItemCell(props: ItemCellProps & ItemSource) {
  return props.itemId !== undefined ? <ItemCellById {...props} /> : <ItemCellView {...props} />;
}

function ItemCellById({ itemId, ...props }: ItemCellProps & { itemId: number }) {
  const { item, isLoading } = useItemById(itemId);
  return <ItemCellView {...props} item={item} loading={isLoading} />;
}

function ItemCellView({
  item,
  loading = false,
  size,
  linkToDetail = false,
  className,
  ...props
}: ItemCellProps & { item: Upgrade | undefined; loading?: boolean }) {
  return (
    <span
      data-slot="item-cell"
      data-size={size ?? "default"}
      className={cn(itemCellVariants({ size }), className)}
      {...props}
    >
      {/* The name beside it already says what this is. */}
      <ItemImage item={item} loading={loading} title="" className={cn("shrink-0", IMAGE_SIZE[size ?? "default"])} />
      <ItemName item={item} loading={loading} linkToDetail={linkToDetail} />
    </span>
  );
}
