import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";
import { itemUpgradesQueryOptions } from "~/queries/asset-queries";

export function ItemName({ itemId, className }: { itemId: number; className?: string }) {
  const { data, isLoading } = useQuery(itemUpgradesQueryOptions);

  const item = useMemo(() => data?.find((item) => item.id === itemId), [data, itemId]);

  if (isLoading) {
    return <Skeleton className={cn("h-4 w-24 inline-block", className)} />;
  }

  return <span className={cn("truncate", className)}>{item?.name ?? "Unknown Item"}</span>;
}
