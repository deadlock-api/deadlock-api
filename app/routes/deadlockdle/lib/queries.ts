import { useQuery } from "@tanstack/react-query";
import type { HeroV2, UpgradeV2 } from "assets_deadlock_api_client/api";
import axios from "axios";
import { assetsApi } from "~/lib/assets-api";
import { ASSETS_ORIGIN } from "~/lib/constants";

export function useHeroes() {
	return useQuery({
		queryKey: ["assets-heroes"],
		queryFn: async () => {
			const res = await assetsApi.heroes_api.getHeroesV2HeroesGet({ onlyActive: true });
			return res.data;
		},
		staleTime: Number.POSITIVE_INFINITY,
	});
}

export function useItems() {
	return useQuery({
		queryKey: ["assets-items-upgrades"],
		queryFn: async () => {
			const res = await assetsApi.items_api.getItemsByTypeV2ItemsByTypeTypeGet({
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
			const res = await assetsApi.items_api.getItemsByTypeV2ItemsByTypeTypeGet({
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
			const res = await assetsApi.default_api.getSoundsV1SoundsGet();
			return res.data as Record<string, unknown>;
		},
		staleTime: Number.POSITIVE_INFINITY,
	});
}

export function useNpcUnits() {
	return useQuery({
		queryKey: ["assets-npc-units"],
		queryFn: async () => {
			const res = await axios.get(`${ASSETS_ORIGIN}/v2/npc-units`);
			return res.data as Array<{
				class_name: string;
				max_health?: number | null;
				gold_reward?: number | null;
				id: number;
				[key: string]: unknown;
			}>;
		},
		staleTime: Number.POSITIVE_INFINITY,
	});
}

export function useGenericData() {
	return useQuery({
		queryKey: ["assets-generic-data"],
		queryFn: async () => {
			const res = await axios.get(`${ASSETS_ORIGIN}/v2/generic-data`);
			return res.data;
		},
		staleTime: Number.POSITIVE_INFINITY,
	});
}

export function filterPlayableHeroes(heroes: HeroV2[]): HeroV2[] {
	return heroes.filter((h) => h.player_selectable && !h.disabled && !h.in_development);
}

export function filterShopableItems(items: UpgradeV2[]): UpgradeV2[] {
	return items.filter((item) => item.shopable && !item.disabled && item.shop_image_webp);
}
