import { Skeleton } from "~/components/ui/skeleton";
import { useItemById } from "~/hooks/useAssetById";

export function ItemTier({ itemId }: { itemId: number }) {
  const { item, isLoading } = useItemById(itemId);

  if (isLoading) {
    return <Skeleton className="inline-block h-4 w-4" />;
  }

  return <>{item?.item_tier ?? "?"}</>;
}
