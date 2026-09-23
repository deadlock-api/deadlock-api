import { type UseQueryResult, useQuery } from "@tanstack/react-query";

import { api } from "~/lib/api";
import { heroesFullQueryOptions, itemUpgradesFullQueryOptions } from "~/queries/asset-queries";

export function useHeroes() {
  return useQuery(heroesFullQueryOptions);
}

export function useItems() {
  return useQuery(itemUpgradesFullQueryOptions);
}

export function useAbilities() {
  return useQuery({
    queryKey: ["assets-items-abilities"],
    queryFn: async () => {
      const res = await api.items_api.getItemsByType({
        type: "ability",
      });
      return res.data;
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useSounds() {
  return useQuery({
    queryKey: ["assets-sounds"],
    queryFn: async () => {
      const res = await api.assets_bucket_api.sounds();
      return res.data as Record<string, unknown>;
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useNpcUnits() {
  return useQuery({
    queryKey: ["assets-npc-units"],
    queryFn: async () => {
      const res = await api.npc_units_api.listNpcUnits();
      return res.data;
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/** Whether a puzzle's queries failed. A puzzle needs every one of them, so any query that failed with no data
 * leaves nothing to play; `retry` refetches only those. */
export function puzzleLoadError(...queries: Pick<UseQueryResult, "data" | "isError" | "isFetching" | "refetch">[]) {
  const failed = queries.filter((query) => query.isError && query.data === undefined);
  return {
    isError: failed.length > 0,
    retrying: failed.some((query) => query.isFetching),
    retry: () => {
      for (const query of failed) void query.refetch();
    },
  };
}
