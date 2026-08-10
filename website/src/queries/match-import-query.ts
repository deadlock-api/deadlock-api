import { queryOptions } from "@tanstack/react-query";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";
import type { Side } from "~/lib/team-builder/analysis";
import { LANES, slotsOfLane, TEAM_SIZE } from "~/lib/team-builder/lanes";

import { queryKeys } from "./query-keys";

export interface ImportedPlayer {
  side: Side;
  slot: number;
  heroId: number;
  accountId: number;
}

export interface ImportedMatch {
  /** Average badge of the team currently shown on each side. */
  badges: { ally?: number; enemy?: number };
  players: ImportedPlayer[];
}

interface RawPlayer {
  account_id: number;
  hero_id: number;
  team: number;
  assigned_lane?: number;
}

/** `game_mode` 2 is Street Brawl: four a side, no lanes, and none of the draft stats apply to it. */
const STREET_BRAWL_GAME_MODE = 2;

interface MatchMetadata {
  match_info: {
    game_mode?: number;
    average_badge_team0?: number | null;
    average_badge_team1?: number | null;
    players: RawPlayer[];
  };
}

/**
 * Lane assignment drives the slot, since slot position *is* the lane on the board. Players the game
 * left unassigned (`assigned_lane` 0) fall into whatever slots the lanes did not claim.
 */
function toSlots(players: RawPlayer[], side: Side): ImportedPlayer[] {
  const placed: (ImportedPlayer | undefined)[] = Array(TEAM_SIZE).fill(undefined);
  const leftovers: RawPlayer[] = [];

  const place = (slot: number, player: RawPlayer) => {
    placed[slot] = { side, slot, heroId: player.hero_id, accountId: player.account_id };
  };

  for (const player of players) {
    const laneIndex = LANES.findIndex((lane) => lane.id === player.assigned_lane);
    const free = laneIndex === -1 ? undefined : slotsOfLane(laneIndex).find((s) => placed[s] === undefined);
    if (free === undefined) {
      leftovers.push(player);
      continue;
    }
    place(free, player);
  }

  for (const player of leftovers) {
    const free = placed.findIndex((p) => p === undefined);
    if (free === -1) break;
    place(free, player);
  }

  return placed.filter((p): p is ImportedPlayer => p !== undefined);
}

/** Applies a board orientation to raw metadata. Pure, so flipping sides costs no request. */
export function parseImportedMatch(metadata: MatchMetadata, allyTeam: 0 | 1): ImportedMatch {
  const info = metadata.match_info;
  const raw = (info.players ?? []).filter((p) => p.hero_id > 0);
  const enemyTeam = allyTeam === 0 ? 1 : 0;
  const badgeOf = (team: 0 | 1) => (team === 0 ? info.average_badge_team0 : info.average_badge_team1) || undefined;

  return {
    badges: { ally: badgeOf(allyTeam), enemy: badgeOf(enemyTeam) },
    players: [
      ...toSlots(
        raw.filter((p) => p.team === allyTeam),
        "ally",
      ),
      ...toSlots(
        raw.filter((p) => p.team === enemyTeam),
        "enemy",
      ),
    ],
  };
}

async function fetchMatchMetadata(matchId: number): Promise<MatchMetadata> {
  const response = await api.matches_api.metadata({ matchId });
  const metadata = response.data as unknown as MatchMetadata;
  if (!metadata?.match_info?.players?.length) throw new Error(`No metadata on record for match ${matchId}`);
  if (metadata.match_info.game_mode === STREET_BRAWL_GAME_MODE) {
    throw new Error(
      "That is a Street Brawl match. Team Builder models a 6v6 draft with three duo lanes, so Street Brawl cannot be analysed here.",
    );
  }
  return metadata;
}

/** Ranked, normal game mode: the only combination the board models a draft for. */
const RANDOM_MATCH_MODE = 1;
const RANDOM_GAME_MODE = 1;

/** Matches fetched in the last ten minutes. The endpoint takes no filters, so modes are cut here. */
export const recentMatchesQueryOptions = queryOptions({
  queryKey: queryKeys.matches.recentlyFetched(),
  queryFn: async () => {
    const response = await api.matches_api.recentlyFetched();
    return response.data.filter(
      (match) => match.match_mode === RANDOM_MATCH_MODE && match.game_mode === RANDOM_GAME_MODE,
    );
  },
  staleTime: CACHE_DURATIONS.FIVE_MINUTES,
});

/**
 * Keyed on the match alone. Which team sits on which side is a view of the same payload, so both
 * orientations share one cache entry and swapping sides never costs a second metadata fetch.
 * Orientation is applied by the caller through `parseImportedMatch`, not by a `select` here: an
 * inline `select` is a new function every render, which defeats React Query's memoisation and hands
 * back a fresh `ImportedMatch` each time.
 */
export function matchMetadataQueryOptions(matchId: number | null) {
  return queryOptions({
    queryKey: queryKeys.matches.importedDraft(matchId),
    queryFn: () => fetchMatchMetadata(matchId as number),
    enabled: matchId !== null,
    retry: false,
    staleTime: CACHE_DURATIONS.ONE_HOUR,
  });
}
