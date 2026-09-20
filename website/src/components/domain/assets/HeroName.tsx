import { Link } from "@tanstack/react-router";
import { memo } from "react";

import type { HeroSource } from "~/components/domain/assets/HeroImage";
import { FOCUS_RING } from "~/components/ui/recipes";
import { Skeleton } from "~/components/ui/skeleton";
import { useHeroById } from "~/hooks/useAssetById";
import { heroSlug } from "~/lib/hero-slug";
import { cn } from "~/lib/utils";
import type { SlimHero } from "~/queries/asset-queries";

// No `ref`: the root is an anchor when linked and a span otherwise, so no single element type would be true.
type HeroNameLook = Omit<React.ComponentPropsWithoutRef<"span">, "children"> & {
  /** Links the name to the hero's analytics page. */
  linkToDetail?: boolean;
};

/** Pass `hero` to render a hero already read by the parent without another query subscription. */
export const HeroName = memo(function HeroName(props: HeroNameLook & HeroSource) {
  return props.heroId !== undefined ? <HeroNameById {...props} /> : <HeroNameView {...props} />;
});

function HeroNameById({ heroId, ...props }: HeroNameLook & { heroId: number }) {
  const { hero, isLoading } = useHeroById(heroId);

  return <HeroNameView {...props} hero={hero} loading={isLoading} />;
}

function HeroNameView({
  hero,
  loading = false,
  linkToDetail = false,
  className,
  onClick,
  ...props
}: HeroNameLook & { hero: SlimHero | undefined; loading?: boolean }) {
  if (loading) {
    return <Skeleton className={cn("inline-block h-4 w-20", className)} />;
  }

  const name = hero?.name ?? "Unknown Hero";

  if (linkToDetail && hero) {
    return (
      <Link
        to="/analytics/heroes/$heroName"
        params={{ heroName: heroSlug(hero.name) }}
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
