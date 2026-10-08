import type { Hero, Upgrade } from "deadlock_api_client";

import { isPlayableHero } from "~/lib/hero-roster";
import { isShopableItem } from "~/lib/item-roster";
import type { Entity } from "~/lib/page-registry";

import type { IntentVocabulary } from "./intent";
import type { Catalog, RankTier } from "./resolve";

export interface SearchCatalog {
  /** The names a question is read against. */
  vocabulary: IntentVocabulary;
  /** What those names are looked up in. */
  catalog: Catalog;
}

type HeroAsset = Entity & Pick<Hero, "development_state" | "disabled" | "class_name">;
type ItemAsset = Entity & Pick<Upgrade, "shopable" | "disabled" | "shop_image_webp">;

/** The search's names from the asset lists: playable heroes, items the shop sells, every rank. */
export function buildSearchCatalog(
  heroes: readonly HeroAsset[],
  items: readonly ItemAsset[],
  ranks: readonly RankTier[],
): SearchCatalog {
  const playable = heroes
    .filter(isPlayableHero)
    .map((hero) => ({ id: hero.id, name: hero.name, codename: hero.class_name.replace(/^hero_/, "") }));
  const shopable = items.filter(isShopableItem);
  return {
    vocabulary: {
      heroNames: playable.map((hero) => hero.name),
      itemNames: shopable.map((item) => item.name),
      rankNames: ranks.map((rank) => rank.name),
    },
    catalog: { heroes: playable, items: shopable, ranks },
  };
}
