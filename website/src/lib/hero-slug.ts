import type { Hero } from "deadlock_api_client";

/** URL slug for a hero, derived from its display name (e.g. "Grey Talon" -> "grey-talon"). */
export function heroSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function findHeroBySlug(heroes: Hero[], slug: string): Hero | undefined {
  return heroes.find((h) => heroSlug(h.name) === slug);
}
