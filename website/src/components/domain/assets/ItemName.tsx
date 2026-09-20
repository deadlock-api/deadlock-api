import { Link } from "@tanstack/react-router";
import { memo } from "react";

import { Skeleton } from "~/components/ui/skeleton";
import { useItemById } from "~/hooks/useAssetById";
import { itemSlug } from "~/lib/item-slug";
import { cn } from "~/lib/utils";

export const ItemName = memo(function ItemName({
  itemId,
  className,
  linkToDetail = false,
}: {
  itemId: number;
  className?: string;
  linkToDetail?: boolean;
}) {
  const { item, isLoading } = useItemById(itemId);

  if (isLoading) {
    return <Skeleton className={cn("inline-block h-4 w-24", className)} />;
  }

  if (linkToDetail && item) {
    return (
      <Link
        to="/analytics/items/$itemName"
        params={{ itemName: itemSlug(item.name) }}
        preload="intent"
        className={cn(
          "truncate rounded-sm outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50",
          className,
        )}
      >
        {item.name}
      </Link>
    );
  }

  return <span className={cn("truncate", className)}>{item?.name ?? "Unknown Item"}</span>;
});
