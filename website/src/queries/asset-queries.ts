import { type QueryClient, queryOptions } from "@tanstack/react-query";
import type { Ability, Hero, Upgrade } from "deadlock_api_client";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";
import { prefetchSafe } from "~/lib/prefetch-safe";
import { type SeasonInfo, toSeasons } from "~/lib/seasons";

import { queryKeys } from "./query-keys";

// The root loader dehydrates heroes and item upgrades into every page's HTML.
// The keys below carry ~2.7 MB of balance tables, tooltips and lore that only
// the Deadlockdle and flashcard pages read, so the shared queries drop them and
// those pages fetch the *Full variants on demand.
const HEAVY_HERO_KEYS = [
  "cost_bonuses",
  "description",
  "hero_stats_ui",
  "item_draft_bucketing",
  "item_draft_weights",
  "item_slot_info",
  "level_info",
  "purchase_bonuses",
  "shop_stat_display",
  "standard_level_up_upgrades",
  "starting_stats",
  "stats_display",
] as const;
const HEAVY_UPGRADE_KEYS = ["description", "properties", "tooltip_sections"] as const;

export type SlimHero = Omit<Hero, (typeof HEAVY_HERO_KEYS)[number]>;
export type SlimUpgrade = Omit<Upgrade, (typeof HEAVY_UPGRADE_KEYS)[number]>;

function omitKeys<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Omit<T, K> {
  const dropped = new Set<PropertyKey>(keys);
  return Object.fromEntries(Object.entries(obj).filter(([key]) => !dropped.has(key))) as Omit<T, K>;
}

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
  queryFn: async (): Promise<SlimHero[]> => (await fetchHeroes()).map((hero) => omitKeys(hero, HEAVY_HERO_KEYS)),
  staleTime: CACHE_DURATIONS.FOREVER,
});

export const heroesFullQueryOptions = queryOptions({
  queryKey: queryKeys.assets.heroesFull(),
  queryFn: fetchHeroes,
  staleTime: CACHE_DURATIONS.FOREVER,
});

export const itemUpgradesQueryOptions = queryOptions({
  queryKey: queryKeys.assets.itemUpgrades(),
  queryFn: async (): Promise<SlimUpgrade[]> =>
    (await fetchItemUpgrades()).map((item) => omitKeys(item, HEAVY_UPGRADE_KEYS)),
  staleTime: CACHE_DURATIONS.FOREVER,
});

export const itemUpgradesFullQueryOptions = queryOptions({
  queryKey: queryKeys.assets.itemUpgradesFull(),
  queryFn: fetchItemUpgrades,
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
  const seasons = await prefetchSafe(queryClient.ensureQueryData(rankedSeasonsQueryOptions));
  return toSeasons(seasons ?? []);
}

export function filterPlayableHeroes<T extends SlimHero>(heroes: T[]): T[] {
  return heroes.filter((h) => h.player_selectable && !h.disabled && !h.in_development);
}

export function filterShopableItems<T extends SlimUpgrade>(items: T[]): T[] {
  return items.filter((item) => item.shopable && !item.disabled && item.shop_image_webp);
}
