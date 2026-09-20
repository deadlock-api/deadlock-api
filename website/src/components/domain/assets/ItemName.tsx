import { Link } from "@tanstack/react-router";
import type { Upgrade } from "deadlock_api_client";
import { memo } from "react";

import type { ItemSource } from "~/components/domain/assets/ItemImage";
import { FOCUS_RING } from "~/components/ui/recipes";
import { Skeleton } from "~/components/ui/skeleton";
import { useItemById } from "~/hooks/useAssetById";
import { itemSlug } from "~/lib/item-slug";
import { cn } from "~/lib/utils";

// No `ref`: the root is an anchor when linked and a span otherwise, so no single element type would be true.
type ItemNameLook = Omit<React.ComponentPropsWithoutRef<"span">, "children"> & {
  /** Links the name to the item's analytics page. */
  linkToDetail?: boolean;
};

/** Pass `item` to render an item already read by the parent without another query subscription. */
export const ItemName = memo(function ItemName(props: ItemNameLook & ItemSource) {
  return props.itemId !== undefined ? <ItemNameById {...props} /> : <ItemNameView {...props} />;
});

function ItemNameById({ itemId, ...props }: ItemNameLook & { itemId: number }) {
  const { item, isLoading } = useItemById(itemId);

  return <ItemNameView {...props} item={item} loading={isLoading} />;
}

function ItemNameView({
  item,
  loading = false,
  linkToDetail = false,
  className,
  onClick,
  ...props
}: ItemNameLook & { item: Upgrade | undefined; loading?: boolean }) {
  if (loading) {
    return <Skeleton className={cn("inline-block h-4 w-24", className)} />;
  }

  const name = item?.name ?? "Unknown Item";

  if (linkToDetail && item) {
    return (
      <Link
        to="/analytics/items/$itemName"
        params={{ itemName: itemSlug(item.name) }}
        preload="intent"
        title={name}
        className={cn(FOCUS_RING, "truncate rounded-sm hover:underline", className)}
        {...props}
        // Rows that hold this name are often clickable themselves (expand, select); the link must not trigger them.
        onClick={(event) => {
          event.stopPropagation();
          onClick?.(event);
        }}
      >
        {name}
      </Link>
    );
  }

  return (
    <span title={name} className={cn("truncate", className)} onClick={onClick} {...props}>
      {name}
    </span>
  );
}
