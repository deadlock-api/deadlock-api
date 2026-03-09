import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Skeleton } from "~/components/ui/skeleton";
import { itemUpgradesQueryOptions } from "~/queries/asset-queries";

export default function ItemTier({ itemId }: { itemId: number }) {
  const { data, isLoading } = useQuery(itemUpgradesQueryOptions);

  const item = useMemo(() => data?.find((item) => item.id === itemId), [data, itemId]);

  if (isLoading) {
    return <Skeleton className="h-4 w-4 inline-block" />;
  }

  return <>{item?.item_tier}</>;
}
