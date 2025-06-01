import type { $MatchHistory } from "~/types/api_match_history";
import type { APIMatchMetadata } from "~/types/api_match_metadata";
import type { AssetsHero } from "~/types/assets_hero";
import type { AssetsItem } from "../../types/assets_item";
import type { MatchDisplayData } from "./MatchCard";

interface MergeMatchDataParams {
  matchHistoryData: $MatchHistory[] | undefined;
  matchesData: APIMatchMetadata[] | undefined;
  steamId: number;
  heroesMap: Record<number, AssetsHero> | undefined;
  upgradeItems: Record<number, AssetsItem> | undefined;
  filteredMatchIds: number[];
}

interface CreateMatchDisplayDataParams {
  historyMatch?: $MatchHistory;
  metadataMatch?: APIMatchMetadata;
  steamId: number;
  heroesMap: Record<number, AssetsHero> | undefined;
  upgradeItems: Record<number, AssetsItem> | undefined;
}

// Function to create a single MatchDisplayData object from history and/or metadata
function createMatchDisplayData({
  historyMatch,
  metadataMatch,
  steamId,
  heroesMap,
  upgradeItems,
}: CreateMatchDisplayDataParams): MatchDisplayData | null {
  // Return null if no data is provided
  if (!historyMatch && !metadataMatch) {
    return null;
  }

  // Prioritize metadata if available
  if (metadataMatch) {
    const playerMetadata = metadataMatch.players.find((p) => p.account_id === steamId);

    // If metadata is available, player metadata should also be available for this steamId
    // If not, something is unexpected, return null for this match
    if (!playerMetadata) {
      return null;
    }

    const isWin = metadataMatch.winning_team === playerMetadata.team;
    const kda =
      playerMetadata.deaths > 0
        ? (playerMetadata.kills + playerMetadata.assists) / playerMetadata.deaths
        : playerMetadata.kills + playerMetadata.assists;

    const finalItems = playerMetadata.items
      .filter((item) => item.sold_time_s === 0 && upgradeItems && item.item_id in upgradeItems)
      .sort((a, b) => {
        // Sort by item tier (ascending), then by game_time_s (ascending)
        // Assume item_id encodes tier as (item_id % 10), adjust if needed
        const tierA = upgradeItems?.[a.item_id]?.item_tier ?? 0;
        const tierB = upgradeItems?.[b.item_id]?.item_tier ?? 0;
        if (tierA !== tierB) {
          return tierA - tierB;
        }
        return a.game_time_s - b.game_time_s;
      })
      .slice(0, 12);

    const hero = heroesMap?.[playerMetadata.hero_id];

    return {
      match: {
        match_id: metadataMatch.match_id,
        start_time: metadataMatch.start_time, // Already Dayjs from schema
        duration_s: metadataMatch.duration_s,
        winning_team: metadataMatch.winning_team, // Already string from schema
        game_mode: metadataMatch.game_mode,
        match_mode: metadataMatch.match_mode,
        average_rank_team0: metadataMatch.average_badge_team0 ?? undefined,
        average_rank_team1: metadataMatch.average_badge_team1 ?? undefined,
      },
      player: {
        account_id: steamId,
        hero_id: playerMetadata.hero_id,
        kills: playerMetadata.kills,
        deaths: playerMetadata.deaths,
        assists: playerMetadata.assists,
        team: playerMetadata.team, // Already string from schema
        items: playerMetadata.items,
        denies: playerMetadata.denies,
        last_hits: playerMetadata.last_hits,
        net_worth: playerMetadata.net_worth,
        player_level: playerMetadata.player_level,
      },
      isWin,
      kda,
      finalItems,
      hero,
      hasFullData: true,
      players: metadataMatch.players, // Include the full players array
    };
  }

  if (historyMatch) {
    // Only history data is available
    const isWin = historyMatch.match_result === "Win";
    const kda =
      historyMatch.player_deaths > 0
        ? (historyMatch.player_kills + historyMatch.player_assists) / historyMatch.player_deaths
        : historyMatch.player_kills + historyMatch.player_assists;
    const hero = heroesMap?.[historyMatch.hero_id];

    return {
      match: {
        match_id: historyMatch.match_id,
        start_time: historyMatch.start_time, // Already Dayjs from schema
        duration_s: historyMatch.match_duration_s,
        winning_team: historyMatch.player_team, // Already string from schema
        // game_mode and match_mode are not available from history
      },
      player: {
        account_id: steamId,
        hero_id: historyMatch.hero_id,
        kills: historyMatch.player_kills,
        deaths: historyMatch.player_deaths,
        assists: historyMatch.player_assists,
        team: historyMatch.player_team, // Already string from schema
        items: [], // Not available from history
      },
      isWin,
      kda,
      finalItems: [], // Not available from history
      hero,
      hasFullData: false,
      // players are not available from history
    };
  }

  // Should not reach here due to initial check, but for type safety
  return null;
}

export function mergeMatchData({
  matchHistoryData,
  matchesData,
  steamId,
  heroesMap,
  upgradeItems,
  filteredMatchIds,
}: MergeMatchDataParams): MatchDisplayData[] {
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
      return createMatchDisplayData({
        historyMatch,
        metadataMatch: metadata,
        steamId,
        heroesMap,
        upgradeItems,
      });
    })
    .filter((x) => x !== null); // Use the type guard here
}
