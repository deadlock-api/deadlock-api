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
        to="/items/$itemName"
        params={{ itemName: itemSlug(item.name) }}
        preload="intent"
        className={cn("truncate hover:underline", className)}
      >
        {item.name}
      </Link>
    );
  }

  return <span className={cn("truncate", className)}>{item?.name ?? "Unknown Item"}</span>;
});
