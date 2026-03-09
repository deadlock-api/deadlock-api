import { memo } from "react";
import { Skeleton } from "~/components/ui/skeleton";
import { useItemById } from "~/hooks/useAssetById";
import { cn } from "~/lib/utils";

export const ItemName = memo(function ItemName({ itemId, className }: { itemId: number; className?: string }) {
  const { item, isLoading } = useItemById(itemId);

  if (isLoading) {
    return <Skeleton className={cn("h-4 w-24 inline-block", className)} />;
  }

  return <span className={cn("truncate", className)}>{item?.name ?? "Unknown Item"}</span>;
});
