import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import z from "zod/v4";
import { Card, CardContent } from "~/components/ui/card";
import type { Dayjs } from "~/dayjs";
import { API_ORIGIN, ASSETS_ORIGIN } from "~/lib/constants";
import { type $MatchHistory, MatchHistory } from "~/types/api_match_history";
import type { APIMatchMetadata } from "~/types/api_match_metadata";
import { APIMatchMetadataSchema } from "~/types/api_match_metadata";
import type { AssetsHero } from "~/types/assets_hero";
import type { AssetsItem } from "~/types/assets_item";
import MatchCard from "./MatchCard";
import { mergeMatchData } from "./matchDataUtils";

export default function MatchHistoryTable({
  steamId,
  hero,
  minDate,
  maxDate,
  setSteamId,
}: {
  steamId: number;
  hero?: number | null;
  minDate?: Dayjs;
  maxDate?: Dayjs;
  setSteamId?: (steamId: number) => void;
}) {
  const { data: heroesData, isLoading: isLoadingHeroes } = useQuery<AssetsHero[]>({
    queryKey: ["assets-heroes"],
    queryFn: () => fetch(new URL("/v2/heroes?only_active=true", ASSETS_ORIGIN)).then((res) => res.json()), // Use new URL()
    staleTime: Number.POSITIVE_INFINITY,
  });

  const { data: itemsData, isLoading: isLoadingItems } = useQuery<AssetsItem[]>({
    queryKey: ["assets-items-upgrades"],
    queryFn: () => fetch(new URL("/v2/items/by-type/upgrade", ASSETS_ORIGIN)).then((res) => res.json()), // Use new URL()
    staleTime: Number.POSITIVE_INFINITY,
  });

  // Fetch match history (simpler data, more comprehensive)
  const { data: matchHistoryData, isLoading: isLoadingMatchHistory } = useQuery<$MatchHistory[]>({
    queryKey: ["api-match-history", steamId],
    queryFn: async () => {
      const url = new URL(`/v1/players/${steamId}/match-history`, API_ORIGIN); // Use new URL()
      const res = await fetch(url);
      const data = await res.json();
      return z.array(MatchHistory.schema).parse(data);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Get match IDs for metadata fetch, filtered and limited
  const filteredMatchIds = useMemo(() => {
    if (!matchHistoryData) return [];

    let filtered = matchHistoryData;

    // Apply hero filter
    if (hero) {
      filtered = filtered.filter((match) => match.hero_id === hero);
    }

    // Apply date filters
    if (minDate || maxDate) {
      filtered = filtered.filter((match) => {
        // match.start_time is already a Dayjs object from the schema transform
        const matchTime = match.start_time;
        const afterMin = !minDate || matchTime.isAfter(minDate);
        const beforeMax = !maxDate || matchTime.isBefore(maxDate);
        return afterMin && beforeMax;
      });
    }

    // Take first 20 matches and extract IDs
    return filtered.slice(0, 20).map((match) => match.match_id);
  }, [matchHistoryData, hero, minDate, maxDate]);

  // Fetch match metadata for the filtered matches
  const { data: matchesData } = useQuery<APIMatchMetadata[]>({
    queryKey: ["api-matches-metadata", filteredMatchIds],
    queryFn: async () => {
      if (filteredMatchIds.length === 0) return [];

      const url = new URL("/v1/matches/metadata", API_ORIGIN); // Use new URL()
      url.searchParams.set("include_info", "true");
      url.searchParams.set("include_player_info", "true");
      url.searchParams.set("include_player_items", "true");
      url.searchParams.set("match_ids", filteredMatchIds.join(","));

      const res = await fetch(url);
      const data = await res.json();

      return z.array(APIMatchMetadataSchema).parse(data);
    },
    throwOnError: true,
    staleTime: 20 * 60 * 1000, // 5 minutes
    enabled: filteredMatchIds.length > 0,
  });

  const heroesMap = useMemo(() => {
    return heroesData?.reduce(
      (acc, hero) => {
        acc[hero.id] = hero;
        return acc;
      },
      {} as Record<number, AssetsHero>,
    );
  }, [heroesData]);

  const itemsMap = useMemo(() => {
    return itemsData?.reduce(
      (acc, item) => {
        acc[item.id] = item;
        return acc;
      },
      {} as Record<number, AssetsItem>,
    );
  }, [itemsData]);

  const upgradeItems = useMemo(() => {
    return itemsData ? Object.fromEntries(itemsData.map((item) => [item.id, item])) : undefined;
  }, [itemsData]);

  // Combine match history with metadata using the new helper function
  const playerMatches = useMemo(() => {
    const matches = mergeMatchData({
      matchHistoryData,
      matchesData,
      steamId,
      heroesMap,
      upgradeItems,
      filteredMatchIds,
    });
    return matches;
  }, [matchHistoryData, matchesData, steamId, heroesMap, upgradeItems, filteredMatchIds]);

  if (isLoadingMatchHistory || isLoadingHeroes || isLoadingItems) {
    return (
      <div className="flex items-center justify-center w-full h-full min-h-48">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (!playerMatches || playerMatches.length === 0) {
    return (
      <Card className="w-fit mx-auto border-red-600">
        <CardContent>
          <p className="text-sm text-red-600 font-bold">No match history available for this player</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <div className="mt-4 space-y-3">
          {playerMatches.map((matchData) => {
            if (!matchData) return null;
            return (
              <MatchCard
                key={matchData.match.match_id}
                matchData={matchData}
                itemsMap={itemsMap}
                heroesMap={heroesMap}
                setSteamId={setSteamId}
              />
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
