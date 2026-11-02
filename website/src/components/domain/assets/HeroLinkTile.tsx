import { Link } from "@tanstack/react-router";

import { HeroImage } from "~/components/domain/assets/HeroImage";
import { FOCUS_RING } from "~/components/ui/recipes";
import { heroSlug } from "~/lib/hero-slug";
import { cn } from "~/lib/utils";
import type { SlimHero } from "~/queries/asset-queries";

/**
 * A hero as a way into their page: portrait over the whole name, the tile lit on hover and focus. Laid out by its
 * parent, in a grid of equal cells (`grid-cols-[repeat(auto-fill,minmax(4rem,1fr))]`), so names never truncate and
 * a wall of heroes lines up in columns.
 */
export function HeroLinkTile({
  hero,
  className,
  ...props
}: Omit<React.ComponentProps<"a">, "href" | "children"> & { hero: Pick<SlimHero, "id" | "name"> }) {
  return (
    <Link
      to="/analytics/heroes/$heroName"
      params={{ heroName: heroSlug(hero.name) }}
      preload="intent"
      data-slot="hero-link-tile"
      className={cn(
        FOCUS_RING,
        "flex min-w-0 flex-col items-center gap-1.5 rounded-md px-1 py-2 text-center text-xs leading-tight text-muted-foreground transition-colors duration-fast ease-standard hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground",
        className,
      )}
      {...props}
    >
      {/* The name under it says who this is. */}
      <HeroImage heroId={hero.id} decorative className="size-12" />
      <span className="w-full text-balance break-words">{hero.name}</span>
    </Link>
  );
}
