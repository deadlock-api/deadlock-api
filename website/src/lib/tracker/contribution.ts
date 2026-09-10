import type { TrackerMatchPlayer } from "~/queries/tracker-queries";

export interface TeamContribution {
  /** Kills and assists over the team's kills, at most 1. */
  killParticipation: number;
  /** Player damage over the team's player damage. */
  damageShare: number;
  /** Net worth over the team's net worth. */
  soulsShare: number;
}

/** Null when the tracked player is not in the match. Shares are 0 when the team total is 0. */
export function computeTeamContribution(players: TrackerMatchPlayer[], accountId: number): TeamContribution | null {
  const tracked = players.find((player) => player.account_id === accountId);
  if (!tracked) return null;
  let kills = 0;
  let damage = 0;
  let souls = 0;
  for (const player of players) {
    if (player.team !== tracked.team) continue;
    kills += player.kills;
    damage += player.player_damage;
    souls += player.net_worth;
  }
  const share = (value: number, total: number) => (total > 0 ? value / total : 0);
  return {
    // Deaths to non-players can still credit assists, which would otherwise push this past 100%.
    killParticipation: Math.min(1, share(tracked.kills + tracked.assists, kills)),
    damageShare: share(tracked.player_damage, damage),
    soulsShare: share(tracked.net_worth, souls),
  };
}
