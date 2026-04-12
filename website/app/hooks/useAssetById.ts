import { useQuery } from "@tanstack/react-query";
import type { UseQueryOptions } from "@tanstack/react-query";
import type { AbilityV2, HeroV2, UpgradeV2 } from "assets_deadlock_api_client/api";

import { abilitiesQueryOptions, heroesQueryOptions, itemUpgradesQueryOptions } from "~/queries/asset-queries";

function useAssetById<T extends { id: number }, TKey extends readonly unknown[]>(
  queryOpts: UseQueryOptions<T[], Error, T[], TKey>,
  id: number,
): { data: T | undefined; isLoading: boolean } {
  const { data, isLoading } = useQuery({
    ...queryOpts,
    select: (items: T[]) => items.find((item) => item.id === id),
  });
  return { data, isLoading };
}

export function useHeroById(heroId: number): { hero: HeroV2 | undefined; isLoading: boolean } {
  const { data: hero, isLoading } = useAssetById(heroesQueryOptions, heroId);
  return { hero, isLoading };
}

export function useAbilityById(abilityId: number): {
  ability: AbilityV2 | undefined;
  isLoading: boolean;
} {
  const { data: ability, isLoading } = useAssetById(abilitiesQueryOptions, abilityId);
  return { ability, isLoading };
}

export function useItemById(itemId: number): { item: UpgradeV2 | undefined; isLoading: boolean } {
  const { data: item, isLoading } = useAssetById(itemUpgradesQueryOptions, itemId);
  return { item, isLoading };
}
