import { memo } from "react";
import { Skeleton } from "~/components/ui/skeleton";
import { useHeroById } from "~/hooks/useAssetById";
import { cn } from "~/lib/utils";

export const HeroName = memo(function HeroName({ heroId, className }: { heroId: number; className?: string }) {
  const { hero, isLoading } = useHeroById(heroId);

  if (isLoading) {
    return <Skeleton className={cn("h-4 w-20 inline-block", className)} />;
  }

  return <span className={cn("truncate", className)}>{hero?.name ?? "Unknown Hero"}</span>;
});
