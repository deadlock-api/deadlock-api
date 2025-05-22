import { useQuery } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import { useMemo } from "react";
import HeroImage from "~/components/HeroImage";
import ItemImage from "~/components/ItemImage";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import type { APIMatchHistory } from "~/types/api_match_history";
import type { APIMatchMetadata } from "~/types/api_match_metadata";
import type { AssetsHero } from "~/types/assets_hero";
import type { AssetsItem } from "~/types/assets_item";

export default function MatchHistoryTable({
  steamId,
  hero,
  minDate,
  maxDate,
}: {
  steamId: number;
  hero?: number | null;
  minDate?: Dayjs | null;
  maxDate?: Dayjs | null;
}) {
  const { data: heroesData, isLoading: isLoadingHeroes } = useQuery<AssetsHero[]>({
    queryKey: ["assets-heroes"],
    queryFn: () => fetch("https://assets.deadlock-api.com/v2/heroes").then((res) => res.json()),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const { data: itemsData, isLoading: isLoadingItems } = useQuery<AssetsItem[]>({
    queryKey: ["assets-items-upgrades"],
    queryFn: () => fetch("https://assets.deadlock-api.com/v2/items/by-type/upgrade").then((res) => res.json()),
    staleTime: Number.POSITIVE_INFINITY,
  });

  // Fetch match history (simpler data, more comprehensive)
  const { data: matchHistoryData, isLoading: isLoadingMatchHistory } = useQuery<APIMatchHistory[]>({
    queryKey: ["api-match-history", steamId],
    queryFn: async () => {
      const url = new URL(`https://api.deadlock-api.com/v1/players/${steamId}/match-history`);
      const res = await fetch(url);
      return await res.json();
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
        const matchTime = dayjs.unix(match.start_time);
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

      const url = new URL("https://api.deadlock-api.com/v1/matches/metadata");
      url.searchParams.set("include_info", "true");
      url.searchParams.set("include_player_info", "true");
      url.searchParams.set("include_player_items", "true");
      url.searchParams.set("match_ids", filteredMatchIds.join(","));

      const res = await fetch(url);
      return await res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
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

  const upgradeItemIds = useMemo(() => {
    return new Set(itemsData?.map((item) => item.id) ?? []);
  }, [itemsData]);

  // Combine match history with metadata using pre-filtered match ids
  const playerMatches = useMemo(() => {
    if (!matchHistoryData || !steamId) return [];

    // Create a map of metadata by match ID for quick lookup
    const metadataMap = new Map<number, APIMatchMetadata>();
    if (matchesData) {
      for (const match of matchesData) {
        metadataMap.set(match.match_id, match);
      }
    }

    // Get filtered matches based on filteredMatchIds (already filtered)
    const filteredMatches = matchHistoryData.filter((match) => filteredMatchIds.includes(match.match_id));

    return filteredMatches
      .map((historyMatch) => {
        const metadata = metadataMap.get(historyMatch.match_id);

        if (metadata) {
          // Use full metadata when available
          const player = metadata.players.find((p) => p.account_id === steamId);
          if (!player) return null;

          const isWin = metadata.winning_team === player.team;
          const kda =
            player.deaths > 0 ? (player.kills + player.assists) / player.deaths : player.kills + player.assists;

          // Get final items from metadata
          const finalItems = player.items
            .filter((item) => item.sold_time_s === 0 && upgradeItemIds.has(item.item_id))
            .sort((a, b) => b.game_time_s - a.game_time_s)
            .slice(0, 6);

          return {
            match: { ...metadata, start_time: dayjs.utc(metadata.start_time).local() },
            player,
            isWin,
            kda,
            finalItems,
            hero: heroesMap?.[player.hero_id],
            hasFullData: true,
          };
        }
        // Fall back to history data only
        const isWin = historyMatch.match_result === 1; // Use match_result instead
        const kda =
          historyMatch.player_deaths > 0
            ? (historyMatch.player_kills + historyMatch.player_assists) / historyMatch.player_deaths
            : historyMatch.player_kills + historyMatch.player_assists;

        return {
          match: {
            match_id: historyMatch.match_id,
            start_time: dayjs.unix(historyMatch.start_time),
            duration_s: historyMatch.match_duration_s,
            winning_team: historyMatch.player_team, // Use player_team
          },
          player: {
            account_id: steamId,
            hero_id: historyMatch.hero_id,
            kills: historyMatch.player_kills,
            deaths: historyMatch.player_deaths,
            assists: historyMatch.player_assists,
            team: historyMatch.player_team,
            items: [], // No items available from history endpoint
          },
          isWin,
          kda,
          finalItems: [],
          hero: heroesMap?.[historyMatch.hero_id],
          hasFullData: false,
        };
      })
      .filter(Boolean);
  }, [matchHistoryData, matchesData, steamId, heroesMap, upgradeItemIds, filteredMatchIds]);

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
      <CardHeader>
        <CardTitle>Recent Matches</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Result</TableHead>
              <TableHead>Hero</TableHead>
              <TableHead>K/D/A</TableHead>
              <TableHead>KDA Ratio</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Final Items</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {playerMatches.map((matchData) => {
              if (!matchData) return null;
              const { match, player, isWin, kda, finalItems, hero } = matchData;

              return (
                <TableRow key={match.match_id}>
                  <TableCell>
                    <Badge
                      variant={isWin ? "default" : "destructive"}
                      className={isWin ? "bg-green-700 hover:bg-green-700 " : ""}
                    >
                      {isWin ? "Win" : "Loss"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {hero && <HeroImage heroId={hero.id} className="size-6" />}
                      <span className="text-sm">{hero?.name || "Unknown"}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-sm">
                      {player.kills}/{player.deaths}/{player.assists}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-sm">{kda.toFixed(2)}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">
                      {Math.floor((match.duration_s || 0) / 60)}:
                      {((match.duration_s || 0) % 60).toString().padStart(2, "0")}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{match.start_time.format("MM/DD/YY HH:mm")}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {finalItems.length > 0
                        ? finalItems.map((item) => {
                            const itemData = itemsMap?.[item.item_id];
                            return itemData ? (
                              <ItemImage
                                key={`${item.item_id}-${item.game_time_s}`}
                                itemId={item.item_id}
                                className="size-6"
                              />
                            ) : null;
                          })
                        : matchData.hasFullData === false
                          ? // biome-ignore lint/suspicious/noArrayIndexKey: this is an appropriate use of index key for a bunch of uniform items
                            Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="size-6 rounded" />)
                          : null}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
