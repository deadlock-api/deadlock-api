import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { UPDATE_INTERVAL_MS } from "~/constants/streamkit/widget";
import { parseSteamIdToId3 } from "~/lib/steam";
import { heroesQueryOptions } from "~/queries/asset-queries";
import { trackerMatchHistoryQueryOptions } from "~/queries/match-history-queries";

export interface Match {
  match_id: number;
  hero_id: number;
  match_result: number;
  player_team: number;
}

export interface MatchHero {
  name: string;
  image: string;
}

export interface MatchEntry {
  match: Match;
  hero: MatchHero;
}

interface UseMatchHistoryResult {
  /** The newest matches whose hero is known, newest first. */
  entries: MatchEntry[];
  loading: boolean;
}

interface UseMatchHistoryParams {
  accountId: string;
  numMatches?: number;
  enabled?: boolean;
}

const EMPTY_HEROES = new Map<number, MatchHero>();

export const useMatchHistory = ({
  accountId,
  numMatches = 10,
  enabled = true,
}: UseMatchHistoryParams): UseMatchHistoryResult => {
  const { data: heroes = EMPTY_HEROES, isLoading: loadingHeroes } = useQuery({
    ...heroesQueryOptions,
    enabled,
    // An OBS source never refocuses or remounts, so a failed first load would hide the strip for the whole stream.
    refetchInterval: (query) => (query.state.status === "error" ? 60_000 : false),
    select: (heroesData) =>
      new Map(
        heroesData.flatMap((h) =>
          h.images.icon_hero_card_webp ? [[h.id, { name: h.name, image: h.images.icon_hero_card_webp }] as const] : [],
        ),
      ),
  });

  // The tracker's cache entry, polled while the overlay is on stream. A SteamID64 in a hand-written widget URL is
  // read exactly, as for the stats, not through a lossy Number().
  const { data: matchesData, isLoading: loadingMatches } = useQuery({
    ...trackerMatchHistoryQueryOptions(Number(parseSteamIdToId3(accountId))),
    enabled,
    refetchInterval: UPDATE_INTERVAL_MS,
    refetchIntervalInBackground: true,
  });

  const entries = useMemo(
    () =>
      (matchesData ?? []).slice(0, numMatches).flatMap((match) => {
        const hero = heroes.get(match.hero_id);
        return hero ? [{ match, hero }] : [];
      }),
    [matchesData, numMatches, heroes],
  );

  return { entries, loading: loadingHeroes || loadingMatches };
};
