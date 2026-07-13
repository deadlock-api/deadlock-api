import { memo } from "react";

import { Skeleton } from "~/components/ui/skeleton";
import { useHeroById } from "~/hooks/useAssetById";
import { heroSlug } from "~/lib/hero-slug";
import { cn } from "~/lib/utils";

export const HeroName = memo(function HeroName({
  heroId,
  className,
  linkToDetail = false,
}: {
  heroId: number;
  className?: string;
  linkToDetail?: boolean;
}) {
  const { hero, isLoading } = useHeroById(heroId);

  if (isLoading) {
    return <Skeleton className={cn("inline-block h-4 w-20", className)} />;
  }

  if (linkToDetail && hero) {
    return (
      <a href={`/heroes/${heroSlug(hero.name)}`} className={cn("truncate hover:underline", className)}>
        {hero.name}
      </a>
    );
  }

  return <span className={cn("truncate", className)}>{hero?.name ?? "Unknown Hero"}</span>;
});
