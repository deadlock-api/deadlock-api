import type { Upgrade } from "deadlock_api_client";

import { slugify } from "./slug";

export function itemSlug(name: string): string {
  return slugify(name);
}

export function findItemBySlug<T extends Pick<Upgrade, "name">>(items: T[], slug: string): T | undefined {
  return items.find((item) => itemSlug(item.name) === slug);
}

/**
 * Slugs of items Valve renamed, by item id. A slug is the item's name, so a rename would turn an address search
 * engines know into a 404; these answer a redirect to the new name instead.
 */
const RENAMED_ITEM_SLUGS: Readonly<Record<string, number>> = {
  "armor-piercing-rounds": 673001892, // Armor Piercer
  "spirit-shredder-bullets": 1144549437, // Spirit Shredder
};

/** The item a slug of its old name points to. */
export function findRenamedItem<T extends Pick<Upgrade, "id">>(items: T[], slug: string): T | undefined {
  const id = RENAMED_ITEM_SLUGS[slug];
  return id === undefined ? undefined : items.find((item) => item.id === id);
}
