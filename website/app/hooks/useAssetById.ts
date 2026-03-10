import { useQuery } from "@tanstack/react-query";
import type { AbilityV2, HeroV2, UpgradeV2 } from "assets_deadlock_api_client/api";

import { abilitiesQueryOptions, heroesQueryOptions, itemUpgradesQueryOptions } from "~/queries/asset-queries";

export function useHeroById(heroId: number): { hero: HeroV2 | undefined; isLoading: boolean } {
  const { data: hero, isLoading } = useQuery({
    ...heroesQueryOptions,
    select: (heroes) => heroes.find((h) => h.id === heroId),
  });
  return { hero, isLoading };
}

export function useAbilityById(abilityId: number): { ability: AbilityV2 | undefined; isLoading: boolean } {
  const { data: ability, isLoading } = useQuery({
    ...abilitiesQueryOptions,
    select: (abilities) => abilities.find((a) => a.id === abilityId),
  });
  return { ability, isLoading };
}

export function useItemById(itemId: number): { item: UpgradeV2 | undefined; isLoading: boolean } {
  const { data: item, isLoading } = useQuery({
    ...itemUpgradesQueryOptions,
    select: (items) => items.find((i) => i.id === itemId),
  });
  return { item, isLoading };
}
