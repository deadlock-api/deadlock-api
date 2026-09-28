import { type UseQueryResult, useQueries, useQuery } from "@tanstack/react-query";
import type { Ability } from "deadlock_api_client";
import { useMemo } from "react";

import { api } from "~/lib/api";
import { abilityOrderQueryOptions } from "~/queries/ability-order-query";
import { filterPlayableHeroes, heroesFullQueryOptions, itemUpgradesFullQueryOptions } from "~/queries/asset-queries";
import { gameStatsQueryOptions } from "~/queries/games-query";
import { heroStatsQueryOptions } from "~/queries/hero-stats-query";
import { draftCounterStatsQueryOptions } from "~/queries/team-builder-queries";

import { buildRounds, pickAbilityHeroes, STATS_RANKS, statsWindow } from "./higher-lower";
import { hasDisplayName } from "./trivia-questions";

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

/**
 * Everything a day of Higher or Lower is built from: the heroes and their abilities, then the hero, matchup, economy
 * and ability order stats of the day's fixed window (`statsWindow`). `rounds` is empty until every query is in.
 */
export function useHigherLowerRounds(date: string) {
  const heroesQuery = useHeroes();
  const abilitiesQuery = useAbilities();
  const range = {
    ...statsWindow(date),
    minAverageBadge: STATS_RANKS.min,
    maxAverageBadge: STATS_RANKS.max,
  };

  const heroes = useMemo(
    () => (heroesQuery.data ? filterPlayableHeroes(heroesQuery.data).map(({ id, name }) => ({ id, name })) : []),
    [heroesQuery.data],
  );
  const abilityHeroes = useMemo(
    () =>
      pickAbilityHeroes(
        heroes.map((hero) => hero.id),
        date,
      ),
    [heroes, date],
  );

  const heroStatsQuery = useQuery(heroStatsQueryOptions({ ...range }));
  const countersQuery = useQuery(draftCounterStatsQueryOptions({ ...range, sameLaneFilter: false }));
  const gameStatsQuery = useQuery(gameStatsQueryOptions({ ...range, bucket: "no_bucket" }));
  const abilityOrderQueries = useQueries({
    queries: abilityHeroes.map((heroId) => abilityOrderQueryOptions({ heroId, ...range, minMatches: 20 })),
  });

  const queries = [heroesQuery, abilitiesQuery, heroStatsQuery, countersQuery, gameStatsQuery, ...abilityOrderQueries];
  const abilityOrdersReady = abilityOrderQueries.length > 0 && abilityOrderQueries.every((query) => query.data);

  const rounds = useMemo(() => {
    const { data: rawAbilities } = abilitiesQuery;
    const { data: heroStats } = heroStatsQuery;
    const { data: counters } = countersQuery;
    const { data: gameStats } = gameStatsQuery;
    if (heroes.length === 0 || !rawAbilities || !heroStats || !counters || !gameStats || !abilityOrdersReady) return [];

    const abilities = new Map<number, { name: string; hero: number }>();
    for (const ability of rawAbilities as Ability[]) {
      if (ability.ability_type !== "signature" && ability.ability_type !== "ultimate") continue;
      if (!hasDisplayName(ability) || ability.hero == null) continue;
      abilities.set(ability.id, { name: ability.name, hero: ability.hero });
    }
    return buildRounds(
      {
        heroes,
        abilities,
        heroStats,
        counters,
        gameStats: gameStats[0],
        abilityOrders: abilityHeroes.map((heroId, i) => ({ heroId, rows: abilityOrderQueries[i]?.data ?? [] })),
      },
      date,
    );
    // The ability order queries are a fresh array each render; their data is read once all are in.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [
    heroes,
    abilitiesQuery.data,
    heroStatsQuery.data,
    countersQuery.data,
    gameStatsQuery.data,
    abilityOrdersReady,
    date,
  ]);

  return { rounds, queries, isLoading: queries.some((query) => query.isLoading) };
}
