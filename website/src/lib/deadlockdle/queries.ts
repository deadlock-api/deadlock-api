import { type UseQueryResult, useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { abilityMaxFirstQueryOptions } from "~/queries/ability-order-query";
import {
  abilitiesFullQueryOptions,
  heroesFullQueryOptions,
  itemUpgradesFullQueryOptions,
  npcUnitsQueryOptions,
} from "~/queries/asset-queries";
import { gameStatsQueryOptions } from "~/queries/games-query";
import { heroStatsQueryOptions } from "~/queries/hero-stats-query";
import { soundIndexQueryOptions } from "~/queries/sound-queries";
import { draftCounterStatsQueryOptions } from "~/queries/team-builder-queries";

import { buildRounds, pickAbilityHeroes, STATS_RANKS, statsWindow } from "./higher-lower";
import { heroPoolOn } from "./roster";
import { hasDisplayName } from "./trivia-questions";

export function useHeroes() {
  return useQuery(heroesFullQueryOptions);
}

export function useItems() {
  return useQuery(itemUpgradesFullQueryOptions);
}

export function useAbilities() {
  return useQuery(abilitiesFullQueryOptions);
}

export function useSounds() {
  return useQuery(soundIndexQueryOptions);
}

export function useNpcUnits() {
  return useQuery(npcUnitsQueryOptions);
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
 * Everything a day of Higher or Lower is built from: the heroes and their abilities, then the hero, matchup and economy
 * stats and max-first abilities of the day's fixed window (`statsWindow`). `rounds` is empty until every query is in.
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
    () => (heroesQuery.data ? heroPoolOn(heroesQuery.data, date).map(({ id, name }) => ({ id, name })) : []),
    [heroesQuery.data, date],
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
  // min_matches 1: a share counts every player, so no ability is cut short.
  const maxFirstQueries = useQueries({
    queries: abilityHeroes.map((heroId) => abilityMaxFirstQueryOptions({ heroId, ...range, minMatches: 1 })),
  });

  const queries = [heroesQuery, abilitiesQuery, heroStatsQuery, countersQuery, gameStatsQuery, ...maxFirstQueries];
  const maxFirstReady = maxFirstQueries.length > 0 && maxFirstQueries.every((query) => query.data);

  const rounds = useMemo(() => {
    const { data: rawAbilities } = abilitiesQuery;
    const { data: heroStats } = heroStatsQuery;
    const { data: counters } = countersQuery;
    const { data: gameStats } = gameStatsQuery;
    if (heroes.length === 0 || !rawAbilities || !heroStats || !counters || !gameStats || !maxFirstReady) return [];

    const abilities = new Map<number, { name: string; hero: number }>();
    for (const ability of rawAbilities) {
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
        maxFirst: abilityHeroes.map((heroId, i) => ({ heroId, rows: maxFirstQueries[i]?.data ?? [] })),
      },
      date,
    );
    // The max-first queries are a fresh array each render; their data is read once all are in.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [heroes, abilitiesQuery.data, heroStatsQuery.data, countersQuery.data, gameStatsQuery.data, maxFirstReady, date]);

  return { rounds, queries, isLoading: queries.some((query) => query.isLoading) };
}
