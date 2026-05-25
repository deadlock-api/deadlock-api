import { useQuery } from "@tanstack/react-query";
import type { UpgradeV2 } from "assets_deadlock_api_client";

import { api } from "~/lib/api";

export function useHeroes() {
  return useQuery({
    queryKey: ["assets-heroes"],
    queryFn: async () => {
      const res = await api.heroes_api.listHeroes({ onlyActive: true });
      return res.data;
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useItems() {
  return useQuery({
    queryKey: ["assets-items-upgrades"],
    queryFn: async () => {
      const res = await api.items_api.getItemsByType({
        type: "upgrade",
      });
      return res.data as UpgradeV2[];
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
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
