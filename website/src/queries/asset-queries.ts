import { type QueryClient, queryOptions } from "@tanstack/react-query";
import type { Ability, Hero, Upgrade } from "deadlock_api_client";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";
import { fetchSlimHeroes, fetchSlimItemUpgrades, type SlimHero, type SlimUpgrade } from "~/lib/asset-fns";
import { buffInfoByType } from "~/lib/buffs";
import { toCorruptionData } from "~/lib/corrupted-items";
import { isPlayableHero } from "~/lib/hero-roster";
import { isShopableItem } from "~/lib/item-roster";
import { catchPrefetch, ensureCached } from "~/lib/prefetch-safe";
import { type SeasonInfo, toSeasons } from "~/lib/seasons";

import { queryKeys } from "./query-keys";

export type { SlimHero, SlimUpgrade };

async function fetchHeroes(): Promise<Hero[]> {
  const response = await api.heroes_api.listHeroes({ onlyActive: true });
  return response.data;
}

async function fetchItemUpgrades(): Promise<Upgrade[]> {
  const response = await api.items_api.getItemsByType({ type: "upgrade" });
  return response.data as Upgrade[];
}

export const heroesQueryOptions = queryOptions({
  queryKey: queryKeys.assets.heroes(),
  queryFn: () => fetchSlimHeroes(),
  staleTime: CACHE_DURATIONS.FOREVER,
});

export const heroesFullQueryOptions = queryOptions({
  queryKey: queryKeys.assets.heroesFull(),
  queryFn: fetchHeroes,
  staleTime: CACHE_DURATIONS.FOREVER,
});

export const itemUpgradesQueryOptions = queryOptions({
  queryKey: queryKeys.assets.itemUpgrades(),
  queryFn: () => fetchSlimItemUpgrades(),
  staleTime: CACHE_DURATIONS.FOREVER,
});

export const itemUpgradesFullQueryOptions = queryOptions({
  queryKey: queryKeys.assets.itemUpgradesFull(),
  queryFn: fetchItemUpgrades,
  staleTime: CACHE_DURATIONS.FOREVER,
});

/** One item with its description and tooltip sections, which the list queries strip. */
export function itemQueryOptions(itemId: number) {
  return queryOptions({
    queryKey: queryKeys.assets.item(itemId),
    queryFn: async () => {
      const response = await api.items_api.getItem({ idOrClassName: String(itemId) });
      return response.data as Upgrade;
    },
    staleTime: CACHE_DURATIONS.FOREVER,
  });
}

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

/** Every NPC unit (troopers, guardians, walkers, bosses) with its stats. */
export const npcUnitsQueryOptions = queryOptions({
  queryKey: queryKeys.assets.npcUnits(),
  queryFn: async () => {
    const response = await api.npc_units_api.listNpcUnits();
    return response.data;
  },
  staleTime: CACHE_DURATIONS.FOREVER,
});

/**
 * Pickup entities (power-ups, permanent buffs) by class name, for the names, units and graph colors of the buff
 * analytics. Everything else the misc entities carry (spawners, shop triggers) is dropped.
 */
export const buffInfoQueryOptions = queryOptions({
  queryKey: queryKeys.assets.miscEntities(),
  queryFn: async () => {
    const response = await api.misc_entities_api.listMiscEntities();
    // Plain data in the cache (it may be dehydrated into the page); the lookup map is built in `select`.
    return response.data
      .filter((entity) => entity.name || entity.buff_type_name)
      .map(({ class_name, name, buff_type_name, buff_type_value_unit, buff_type_graph_color }) => ({
        class_name,
        name,
        buff_type_name,
        buff_type_value_unit,
        buff_type_graph_color,
      }));
  },
  select: buffInfoByType,
  staleTime: CACHE_DURATIONS.FOREVER,
});

/**
 * What corrupting an item does besides its own bonuses: the penalties it can roll (localized), the Broker's frame art,
 * the price by tier and the Street Brawl round. Only this slice of the generic data is kept, so a page that preloads
 * it does not carry lanes and glitch settings into its HTML.
 */
export const corruptionQueryOptions = queryOptions({
  queryKey: queryKeys.assets.corruption(),
  queryFn: async () => toCorruptionData((await api.generic_data_api.getGenericData()).data),
  staleTime: CACHE_DURATIONS.FOREVER,
});

export const rankedSeasonsQueryOptions = queryOptions({
  queryKey: queryKeys.assets.rankedSeasons(),
  queryFn: async () => {
    const response = await api.ranked_seasons_api.listRankedSeasons();
    return response.data;
  },
  // Transform in `select`, not in `queryFn`: on the client the query is served
  // from the dehydrated cache, so `queryFn` never runs there and the season
  // boundaries `toSeasons` registers would stay missing.
  select: toSeasons,
  staleTime: CACHE_DURATIONS.FOREVER,
});

/** Loader-side counterpart of `useSeasons`. Falls back to no seasons if the endpoint is unavailable. */
export async function loadSeasons(queryClient: QueryClient): Promise<SeasonInfo[]> {
  // `query()` applies `select`, so this already is `toSeasons` of the cached response.
  const seasons = await catchPrefetch(ensureCached(queryClient, rankedSeasonsQueryOptions));
  return seasons ?? [];
}

export function filterPlayableHeroes<T extends SlimHero>(heroes: T[]): T[] {
  return heroes.filter(isPlayableHero);
}

export function filterShopableItems<T extends SlimUpgrade>(items: T[]): T[] {
  return items.filter(isShopableItem);
}
