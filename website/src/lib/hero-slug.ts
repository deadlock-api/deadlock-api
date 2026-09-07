import type { Hero } from "deadlock_api_client";

import { slugify } from "./slug";

export function heroSlug(name: string): string {
  return slugify(name);
}

export function findHeroBySlug<T extends Pick<Hero, "name">>(heroes: T[], slug: string): T | undefined {
  return heroes.find((h) => heroSlug(h.name) === slug);
}
