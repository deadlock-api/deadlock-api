import { useQuery } from "@tanstack/react-query";
import type { UseQueryOptions } from "@tanstack/react-query";
import type { Ability } from "deadlock_api_client";

import { isPlayableHero } from "~/lib/hero-roster";
import {
  abilitiesQueryOptions,
  heroesQueryOptions,
  itemUpgradesQueryOptions,
  type SlimHero,
  type SlimUpgrade,
} from "~/queries/asset-queries";

/**
 * Each cached asset list's index by id, built once per list: dozens of hero and item images on a page each select
 * their asset from the same list, and a linear scan per subscriber per render added up. Keyed weakly on the cached
 * array, so a refetched list gets a new index and the old one is collected with it.
 */
const indexes = new WeakMap<readonly { id: number }[], Map<number, { id: number }>>();

function findById<T extends { id: number }>(items: readonly T[], id: number): T | undefined {
  let index = indexes.get(items) as Map<number, T> | undefined;
  if (!index) {
    index = new Map();
    // The first entry of an id wins, as `find` did.
    for (const item of items) if (!index.has(item.id)) index.set(item.id, item);
    indexes.set(items, index);
  }
  return index.get(id);
}

function useAssetById<T extends { id: number }, TKey extends readonly unknown[]>(
  queryOpts: UseQueryOptions<T[], Error, T[], TKey>,
  id: number,
): { data: T | undefined; isLoading: boolean } {
  const { data, isLoading } = useQuery({
    ...queryOpts,
    select: (items: T[]) => findById(items, id),
  });
  return { data, isLoading };
}

export function useHeroById(heroId: number): { hero: SlimHero | undefined; isLoading: boolean } {
  const { data: hero, isLoading } = useAssetById(heroesQueryOptions, heroId);
  return { hero, isLoading };
}

export function useAbilityById(abilityId: number): {
  ability: Ability | undefined;
  isLoading: boolean;
} {
  const { data: ability, isLoading } = useAssetById(abilitiesQueryOptions, abilityId);
  return { ability, isLoading };
}

export function useItemById(itemId: number): { item: SlimUpgrade | undefined; isLoading: boolean } {
  const { data: item, isLoading } = useAssetById(itemUpgradesQueryOptions, itemId);
  return { item, isLoading };
}

/**
 * The hero id when it names a playable hero, otherwise null: a hand-edited `?hero=9999` showed "Any" in the filter while the
 * requests still carried it and matched nothing. While the hero list loads, the id is trusted.
 */
export function useKnownHeroId(heroId: number | null): number | null {
  const { data: known } = useQuery({
    ...heroesQueryOptions,
    select: (heroes: SlimHero[]) => heroId == null || heroes.some((hero) => hero.id === heroId && isPlayableHero(hero)),
  });
  return known === false ? null : heroId;
}
