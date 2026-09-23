import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { heroesQueryOptions } from "~/queries/asset-queries";
import { matchHistoryQueryOptions } from "~/queries/match-history-queries";

export interface Match {
  match_id: number;
  hero_id: number;
  match_result: number;
  player_team: number;
}

interface UseMatchHistoryResult {
  matches: Match[];
  heroes: Map<number, string>;
  loading: boolean;
}

interface UseMatchHistoryParams {
  accountId: string;
  numMatches?: number;
}

const EMPTY_HEROES = new Map<number, string>();

export const useMatchHistory = ({ accountId, numMatches = 10 }: UseMatchHistoryParams): UseMatchHistoryResult => {
  const { data: heroes = EMPTY_HEROES, isLoading: loadingHeroes } = useQuery({
    ...heroesQueryOptions,
    // An OBS source never refocuses or remounts, so a failed first load would hide the strip for the whole stream.
    refetchInterval: (query) => (query.state.status === "error" ? 60_000 : false),
    select: (heroesData) =>
      new Map(
        heroesData
          .filter((h) => h.images.icon_hero_card_webp)
          .map((h) => [h.id, h.images.icon_hero_card_webp as string]),
      ),
  });

  const { data: matchesData, isLoading: loadingMatches } = useQuery(matchHistoryQueryOptions(accountId));

  const matches = useMemo(() => matchesData?.slice(0, numMatches) ?? [], [matchesData, numMatches]);

  return { matches, heroes, loading: loadingHeroes || loadingMatches };
};
