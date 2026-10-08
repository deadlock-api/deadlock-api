import { Link, type NotFoundRouteProps } from "@tanstack/react-router";

import { NotFound } from "~/components/app/NotFound";
import { heroSlug } from "~/lib/hero-slug";
import { itemSlug } from "~/lib/item-slug";

/**
 * The 404 of a hero or item page, offering the closest name the loader found ("Did you mean Haze?"). The route's
 * loader throws `notFound({ data: { suggestion } })`.
 */
export function EntityNotFound({ entity, data }: { entity: "hero" | "item" } & Pick<NotFoundRouteProps, "data">) {
  const suggestion = (data as { suggestion?: string } | undefined)?.suggestion;
  return (
    <NotFound
      didYouMean={
        suggestion &&
        (entity === "hero" ? (
          <Link to="/analytics/heroes/$heroName" params={{ heroName: heroSlug(suggestion) }}>
            {suggestion}
          </Link>
        ) : (
          <Link to="/analytics/items/$itemName" params={{ itemName: itemSlug(suggestion) }}>
            {suggestion}
          </Link>
        ))
      }
    />
  );
}
