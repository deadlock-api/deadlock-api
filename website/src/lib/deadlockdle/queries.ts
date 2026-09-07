import { useQuery } from "@tanstack/react-query";

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
