import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import type { UseMatchHistoryResult } from "~/components/streamkit/widgets/MatchHistory/MatchHistory.types";
import { heroesQueryOptions } from "~/queries/asset-queries";
import { matchHistoryQueryOptions } from "~/queries/match-history-queries";

interface UseMatchHistoryParams {
  accountId: string;
  numMatches?: number;
}

const EMPTY_HEROES = new Map<number, string>();

export const useMatchHistory = ({ accountId, numMatches = 10 }: UseMatchHistoryParams): UseMatchHistoryResult => {
  const { data: heroes = EMPTY_HEROES, isLoading: loadingHeroes } = useQuery({
    ...heroesQueryOptions,
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
