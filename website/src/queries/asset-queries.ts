import { queryOptions } from "@tanstack/react-query";
import type { Ability, Hero, Upgrade } from "deadlock_api_client";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";

import { queryKeys } from "./query-keys";

export const heroesQueryOptions = queryOptions({
  queryKey: queryKeys.assets.heroes(),
  queryFn: async () => {
    const response = await api.heroes_api.listHeroes({ onlyActive: true });
    return response.data;
  },
  staleTime: CACHE_DURATIONS.FOREVER,
});

export const itemUpgradesQueryOptions = queryOptions({
  queryKey: queryKeys.assets.itemUpgrades(),
  queryFn: async () => {
    const response = await api.items_api.getItemsByType({
      type: "upgrade",
    });
    return response.data as Upgrade[];
  },
  staleTime: CACHE_DURATIONS.FOREVER,
});

export const abilitiesQueryOptions = queryOptions({
  queryKey: queryKeys.assets.abilities(),
  queryFn: async () => {
    const response = await api.items_api.getItemsByType({
      type: "ability",
    });
    return response.data as Ability[];
  },
  staleTime: CACHE_DURATIONS.FOREVER,
});

export function filterPlayableHeroes(heroes: Hero[]): Hero[] {
  return heroes.filter((h) => h.player_selectable && !h.disabled && !h.in_development);
}

export function filterShopableItems(items: Upgrade[]): Upgrade[] {
  return items.filter((item) => item.shopable && !item.disabled && item.shop_image_webp);
}
