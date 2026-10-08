import { createServerFn } from "@tanstack/react-start";
import type { Hero, HeroImages, Upgrade } from "deadlock_api_client";

import { api } from "~/lib/api";

// The hero and upgrade lists are preloaded into the HTML of most game-data pages, and the full API answers are 1.3 MB
// and 2 MB of balance tables, tooltips and lore. These lists name the fields the site reads; nothing else leaves the
// Worker, so a field the API adds later doesn't reach the page, and reading one not listed here fails typechecking.
// Deadlockdle and the flashcards read the full answers (`*FullQueryOptions`) on demand.
const HERO_FIELDS = [
  "id",
  "name",
  // `hero_atlas`: the codename the sounds page names a hero's voice lines by.
  "class_name",
  "colors",
  "complexity",
  "development_state",
  "disabled",
  "hero_type",
] as const satisfies readonly (keyof Hero)[];
const HERO_IMAGE_FIELDS = [
  "hero_card_critical_webp",
  "icon_hero_card",
  "icon_hero_card_webp",
  "icon_image_small",
  "icon_image_small_webp",
  "minimap_image",
  "minimap_image_webp",
] as const satisfies readonly (keyof HeroImages)[];
/** Of the 15 `items` slots (weapons, movement, innates) only the four signature abilities are read. */
const HERO_ITEM_SLOTS = new Set(["signature1", "signature2", "signature3", "signature4"]);
const UPGRADE_FIELDS = [
  "id",
  "name",
  "class_name",
  "component_items",
  "corrupted_info",
  "cost",
  "disabled",
  "image_webp",
  "item_slot_type",
  "item_tier",
  "shop_image_small",
  "shop_image_webp",
  "shopable",
] as const satisfies readonly (keyof Upgrade)[];

export type SlimHero = Pick<Hero, (typeof HERO_FIELDS)[number]> & {
  images: Pick<HeroImages, (typeof HERO_IMAGE_FIELDS)[number]>;
  items: Hero["items"];
};
export type SlimUpgrade = Pick<Upgrade, (typeof UPGRADE_FIELDS)[number]>;

function pickKeys<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K> {
  return Object.fromEntries(keys.filter((key) => key in obj).map((key) => [key, obj[key]])) as Pick<T, K>;
}

/** Active heroes with only the fields the site reads. Runs in the Worker, also for a browser's request. */
export const fetchSlimHeroes = createServerFn({ method: "GET" }).handler(async (): Promise<SlimHero[]> => {
  const response = await api.heroes_api.listHeroes({ onlyActive: true });
  return response.data.map((hero) =>
    Object.assign(pickKeys(hero, HERO_FIELDS), {
      images: pickKeys(hero.images, HERO_IMAGE_FIELDS),
      items: Object.fromEntries(Object.entries(hero.items).filter(([slot]) => HERO_ITEM_SLOTS.has(slot))),
    }),
  );
});

/** Shop upgrades with only the fields the site reads. Runs in the Worker, also for a browser's request. */
export const fetchSlimItemUpgrades = createServerFn({ method: "GET" }).handler(async (): Promise<SlimUpgrade[]> => {
  const response = await api.items_api.getItemsByType({ type: "upgrade" });
  return (response.data as Upgrade[]).map((item) => pickKeys(item, UPGRADE_FIELDS));
});
