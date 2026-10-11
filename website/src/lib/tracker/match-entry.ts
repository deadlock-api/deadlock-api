import type { PlayerMatchHistoryEntry } from "deadlock_api_client";

import type { MatchSummary } from "~/queries/tracker-queries";

// The stored match speaks in names ("StreetBrawl", "Ranked", "Team1"); the match history in the game's enum numbers.

const GAME_MODES: Record<string, number> = { Normal: 1, OnevOneTest: 2, Sandbox: 3, StreetBrawl: 4 };
const MATCH_MODES: Record<string, number> = {
  Unranked: 1,
  PrivateLobby: 2,
  CoopBot: 3,
  Ranked: 4,
  ServerTest: 5,
  Tutorial: 6,
  HeroLabs: 7,
  NewPlayerPlacement: 8,
};
const PLAYER_OUTCOMES: Record<string, number> = { Win: 1, Loss: 2, Penalized: 3, PenalizedParty: 4, NotScored: 5 };

const teamIndex = (team: string) => (team === "Team1" ? 1 : 0);

/**
 * One player's match as their match history would list it, read from the stored match: so a match opened on its own
 * page, seen through that player, shows the very header the tracker shows. Undefined when they were not in it.
 */
export function historyEntryOf(summary: MatchSummary, accountId: number): PlayerMatchHistoryEntry | undefined {
  const player = summary.players.find((candidate) => candidate.account_id === accountId);
  if (!player) return undefined;
  const rounds = summary.round_durations_s;
  return {
    account_id: player.account_id,
    match_id: summary.match_id,
    hero_id: player.hero_id,
    hero_level: player.player_level,
    start_time: summary.start_time,
    game_mode: GAME_MODES[summary.game_mode] ?? 0,
    match_mode: MATCH_MODES[summary.match_mode] ?? 0,
    match_duration_s: summary.duration_s,
    match_result: teamIndex(summary.winning_team),
    player_team: teamIndex(player.team),
    player_kills: player.kills,
    player_deaths: player.deaths,
    player_assists: player.assists,
    net_worth: player.net_worth,
    last_hits: player.last_hits,
    denies: player.denies,
    player_match_outcome: PLAYER_OUTCOMES[player.player_match_outcome] ?? 0,
    objectives_mask_team0: 0,
    objectives_mask_team1: 0,
    abandoned_time_s: player.abandon_match_time_s,
    brawl_score_team0: summary.team_score?.[0] ?? null,
    brawl_score_team1: summary.team_score?.[1] ?? null,
    brawl_avg_round_time_s:
      rounds.length > 0 ? Math.round(rounds.reduce((sum, round) => sum + round, 0) / rounds.length) : null,
    ranked_display_badge: player.rank_badge,
    ranked_delta: player.rank_delta,
    ranked_used_demotion_protection: player.demotion_protected,
    ranked_calibration_match: player.calibration ? 1 : null,
  };
}
