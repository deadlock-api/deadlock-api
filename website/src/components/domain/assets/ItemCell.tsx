import { Link } from "@tanstack/react-router";
import { cva, type VariantProps } from "class-variance-authority";
import type { Upgrade } from "deadlock_api_client";

import { ItemImageFromAsset } from "~/components/domain/assets/ItemImage";
import { Skeleton } from "~/components/ui/skeleton";
import { useItemById } from "~/hooks/useAssetById";
import { itemSlug } from "~/lib/item-slug";
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
 */
export function ItemCell({ itemId, ...props }: ItemCellProps & { itemId: number }) {
  const { item, isLoading } = useItemById(itemId);
  return <ItemCellFromAsset item={item} loading={isLoading} {...props} />;
}

/** Render an item already read by the parent: a long table then holds one subscription, not one per row. */
export function ItemCellFromAsset({
  item,
  loading = false,
  size,
  linkToDetail = false,
  className,
  ...props
}: ItemCellProps & { item: Upgrade | undefined; loading?: boolean }) {
  const name = item?.name ?? "Unknown Item";
  return (
    <span
      data-slot="item-cell"
      data-size={size ?? "default"}
      className={cn(itemCellVariants({ size }), className)}
      {...props}
    >
      {/* The name beside it already says what this is. */}
      <ItemImageFromAsset
        item={item}
        loading={loading}
        title=""
        className={cn("shrink-0", IMAGE_SIZE[size ?? "default"])}
      />
      {loading ? (
        <Skeleton className="h-4 w-24" />
      ) : linkToDetail && item ? (
        <Link
          to="/analytics/items/$itemName"
          params={{ itemName: itemSlug(item.name) }}
          preload="intent"
          title={name}
          // Rows that hold this cell are often clickable themselves (expand, select); the link must not trigger them.
          onClick={(event) => event.stopPropagation()}
          className="truncate rounded-sm outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {name}
        </Link>
      ) : (
        <span title={name} className="truncate">
          {name}
        </span>
      )}
    </span>
  );
}
