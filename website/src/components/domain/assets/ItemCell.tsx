import { ItemImage, type ItemSource } from "~/components/domain/assets/ItemImage";
import { ItemName } from "~/components/domain/assets/ItemName";
import { useItemById } from "~/hooks/useAssetById";
import { cn } from "~/lib/utils";
import type { SlimUpgrade } from "~/queries/asset-queries";

type ItemCellProps = Omit<React.ComponentProps<"span">, "children"> & {
  /** Links the name to the item's analytics page. */
  linkToDetail?: boolean;
  /** `sm`: a 24px icon, for dense tables, as HeroCell's. */
  size?: "sm" | "default";
  /**
   * A quiet second line under the name, beside the icon: "1,234 matches". The row keeps the icon's height instead of
   * stacking a line under the whole cell.
   */
  meta?: React.ReactNode;
};

const IMAGE_SIZE = { sm: "size-6", default: "size-8" } as const;

/**
 * A shop item as the identity of a row: icon and name on one line, with an optional `meta` line under the name. The
 * name truncates to the width the parent leaves (cap it with a `max-w-*` on the cell); the text size is the parent's.
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
  linkToDetail = false,
  size = "default",
  meta,
  className,
  ...props
}: ItemCellProps & { item: SlimUpgrade | undefined; loading?: boolean }) {
  const name = <ItemName item={item} loading={loading} linkToDetail={linkToDetail} />;
  return (
    <span
      data-slot="item-cell"
      data-size={size}
      className={cn("flex min-w-0 items-center", size === "sm" ? "gap-1.5" : "gap-2", className)}
      {...props}
    >
      {/* The name beside it already says what this is. */}
      <ItemImage item={item} loading={loading} alt="" title="" className={cn("shrink-0", IMAGE_SIZE[size])} />
      {meta === undefined ? (
        name
      ) : (
        <span className="flex min-w-0 flex-col">
          {name}
          <span data-slot="item-cell-meta" className="truncate type-caption text-muted-foreground tabular-nums">
            {meta}
          </span>
        </span>
      )}
    </span>
  );
}
