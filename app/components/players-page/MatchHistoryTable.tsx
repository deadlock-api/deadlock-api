import { useQuery } from "@tanstack/react-query";
import type { HeroV2 } from "assets-deadlock-api-client";
import type { UpgradeV2 } from "assets-deadlock-api-client/api";
import { useMemo } from "react";
import { Card, CardContent } from "~/components/ui/card";
import { type Dayjs, day } from "~/dayjs";
import { api } from "~/lib/api";
import { assetsApi } from "~/lib/assets-api";
import type { APIMatchMetadata } from "~/types/api_match_metadata";
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
  const { data: heroesData, isLoading: isLoadingHeroes } = useQuery({
    queryKey: ["assets-heroes"],
    queryFn: async () => {
      const response = await assetsApi.heroes_api.getHeroesV2HeroesGet({ onlyActive: true });
      return response.data;
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

  const { data: itemsData, isLoading: isLoadingItems } = useQuery({
    queryKey: ["assets-items-upgrades"],
    queryFn: async () => {
      const response = await assetsApi.items_api.getItemsByTypeV2ItemsByTypeTypeGet({ type: "upgrade" });
      return response.data as UpgradeV2[];
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

  // Fetch match history (simpler data, more comprehensive)
  const { data: matchHistoryData, isLoading: isLoadingMatchHistory } = useQuery({
    queryKey: ["api-match-history", steamId],
    queryFn: async () => {
      const response = await api.players_api.matchHistory({
        accountId: steamId,
      });
      return response.data;
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
        const matchTime = day.utc(match.start_time).local();
        const afterMin = !minDate || matchTime.isAfter(minDate);
        const beforeMax = !maxDate || matchTime.isBefore(maxDate);
        return afterMin && beforeMax;
      });
    }

    // Take first 20 matches and extract IDs
    return filtered.slice(0, 20).map((match) => match.match_id);
  }, [matchHistoryData, hero, minDate, maxDate]);

  // Fetch match metadata for the filtered matches
  const { data: matchesData } = useQuery({
    queryKey: ["api-matches-metadata", filteredMatchIds],
    queryFn: async () => {
      if (filteredMatchIds.length === 0) return [];
      const response = await api.matches_api.bulkMetadata({
        includeInfo: true,
        includePlayerInfo: true,
        includePlayerItems: true,
        matchIds: filteredMatchIds,
      });
      return response.data as unknown as APIMatchMetadata[];
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
      {} as Record<number, HeroV2>,
    );
  }, [heroesData]);

  const itemsMap = useMemo(() => {
    return itemsData?.reduce(
      (acc, item) => {
        acc[item.id] = item;
        return acc;
      },
      {} as Record<number, UpgradeV2>,
    );
  }, [itemsData]);

  const upgradeItems = useMemo(() => {
    return itemsData ? Object.fromEntries(itemsData.map((item) => [item.id, item])) : undefined;
  }, [itemsData]);

  // Combine match history with metadata using the new helper function
  const playerMatches = useMemo(
    () =>
      mergeMatchData({
        matchHistoryData,
        matchesData,
        steamId,
        heroesMap,
        upgradeItems,
        filteredMatchIds,
      }),
    [matchHistoryData, matchesData, steamId, heroesMap, upgradeItems, filteredMatchIds],
  );

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
