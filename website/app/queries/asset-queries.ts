import { queryOptions } from "@tanstack/react-query";
import type { AbilityV2, UpgradeV2 } from "assets_deadlock_api_client/api";
import { assetsApi } from "~/lib/assets-api";

export const heroesQueryOptions = queryOptions({
  queryKey: ["assets-heroes"],
  queryFn: async () => {
    const response = await assetsApi.heroes_api.getHeroesV2HeroesGet({ onlyActive: true });
    return response.data;
  },
  staleTime: Number.POSITIVE_INFINITY,
});

export const itemUpgradesQueryOptions = queryOptions({
  queryKey: ["assets-items-upgrades"],
  queryFn: async () => {
    const response = await assetsApi.items_api.getItemsByTypeV2ItemsByTypeTypeGet({ type: "upgrade" });
    return response.data as UpgradeV2[];
  },
  staleTime: Number.POSITIVE_INFINITY,
});

export const abilitiesQueryOptions = queryOptions({
  queryKey: ["assets-items-abilities"],
  queryFn: async () => {
    const response = await assetsApi.items_api.getItemsByTypeV2ItemsByTypeTypeGet({ type: "ability" });
    return response.data as AbilityV2[];
  },
  staleTime: Number.POSITIVE_INFINITY,
});
