import { queryOptions } from "@tanstack/react-query";
import type { AbilityV2, HeroV2, UpgradeV2 } from "assets_deadlock_api_client/api";

import { CACHE_DURATIONS } from "~/constants/cache";
import { assetsApi } from "~/lib/assets-api";

import { queryKeys } from "./query-keys";

export const heroesQueryOptions = queryOptions({
  queryKey: queryKeys.assets.heroes(),
  queryFn: async () => {
    const response = await assetsApi.heroes_api.getHeroesV2HeroesGet({ onlyActive: true });
    return response.data;
  },
  staleTime: CACHE_DURATIONS.FOREVER,
});

export const itemUpgradesQueryOptions = queryOptions({
  queryKey: queryKeys.assets.itemUpgrades(),
  queryFn: async () => {
    const response = await assetsApi.items_api.getItemsByTypeV2ItemsByTypeTypeGet({
      type: "upgrade",
    });
    return response.data as UpgradeV2[];
  },
  staleTime: CACHE_DURATIONS.FOREVER,
});

export const abilitiesQueryOptions = queryOptions({
  queryKey: queryKeys.assets.abilities(),
  queryFn: async () => {
    const response = await assetsApi.items_api.getItemsByTypeV2ItemsByTypeTypeGet({
      type: "ability",
    });
    return response.data as AbilityV2[];
  },
  staleTime: CACHE_DURATIONS.FOREVER,
});

export function filterPlayableHeroes(heroes: HeroV2[]): HeroV2[] {
  return heroes.filter((h) => h.player_selectable && !h.disabled && !h.in_development);
}

export function filterShopableItems(items: UpgradeV2[]): UpgradeV2[] {
  return items.filter((item) => item.shopable && !item.disabled && item.shop_image_webp);
}
