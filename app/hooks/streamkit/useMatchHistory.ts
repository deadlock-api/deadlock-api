import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import type {
  Hero,
  Match,
  UseMatchHistoryResult,
} from "~/components/streamkit/widgets/MatchHistory/MatchHistory.types";
import { CACHE_DURATIONS } from "~/constants/cache";
import { UPDATE_INTERVAL_MS } from "~/constants/streamkit/widget";
import { API_ORIGIN, ASSETS_ORIGIN } from "~/lib/constants";
import { queryKeys } from "~/queries/query-keys";

interface UseMatchHistoryParams {
  accountId: string;
  numMatches?: number;
}

export const useMatchHistory = ({ accountId, numMatches = 10 }: UseMatchHistoryParams): UseMatchHistoryResult => {
  const { data: heroes = new Map<number, string>(), isLoading: loadingHeroes } = useQuery<
    Hero[],
    Error,
    Map<number, string>
  >({
    queryKey: queryKeys.streamkit.heroes(),
    queryFn: async () => {
      const res = await fetch(`${ASSETS_ORIGIN}/v2/heroes`);
      if (!res.ok) throw new Error(`Failed to fetch heroes: ${res.status}`);
      return res.json();
    },
    staleTime: CACHE_DURATIONS.FOREVER,
    select: (heroesData) =>
      Array.isArray(heroesData)
        ? new Map(heroesData.map((h) => [h.id, h.images.icon_hero_card_webp]))
        : new Map<number, string>(),
  });

  const { data: matchesData, isLoading: loadingMatches } = useQuery<Match[]>({
    queryKey: queryKeys.streamkit.matchHistory(accountId),
    queryFn: async () => {
      const res = await fetch(`${API_ORIGIN}/v1/players/${accountId}/match-history`);
      if (res.status === 429) {
        const fallback = await fetch(`${API_ORIGIN}/v1/players/${accountId}/match-history?only_stored_history=true`);
        if (!fallback.ok) throw new Error(`Failed to fetch match history fallback: ${fallback.status}`);
        return await fallback.json();
      }
      if (!res.ok) throw new Error(`Failed to fetch match history: ${res.status}`);
      return await res.json();
    },
    staleTime: UPDATE_INTERVAL_MS - 10000,
    refetchInterval: UPDATE_INTERVAL_MS,
    refetchIntervalInBackground: true,
  });

  const matches = useMemo(() => {
    if (!Array.isArray(matchesData)) return [];
    return matchesData.slice(0, numMatches);
  }, [matchesData, numMatches]);

  return { matches, heroes, loading: loadingHeroes || loadingMatches };
};
