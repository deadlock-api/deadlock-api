import { type QueryClient, queryOptions } from "@tanstack/react-query";
import type { Ability, Hero, Upgrade } from "deadlock_api_client";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";
import { prefetchSafe } from "~/lib/prefetch-safe";
import { type SeasonInfo, toSeasons } from "~/lib/seasons";

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

export function filterPlayableHeroes(heroes: Hero[]): Hero[] {
  return heroes.filter((h) => h.player_selectable && !h.disabled && !h.in_development);
}

export function filterShopableItems(items: Upgrade[]): Upgrade[] {
  return items.filter((item) => item.shopable && !item.disabled && item.shop_image_webp);
}
