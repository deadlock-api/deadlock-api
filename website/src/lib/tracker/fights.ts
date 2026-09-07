import type { TrackerMatchPlayer, TrackerPlayerDeaths } from "~/queries/tracker-queries";

export interface KillEvent {
  /** Seconds since the match started. */
  time: number;
  victim: TrackerMatchPlayer;
}

export interface DeathEvent {
  time: number;
  /** Null when no player was credited, e.g. a guardian or creep kill. */
  killer: TrackerMatchPlayer | null;
  /** Seconds until the respawn. */
  deadForS: number;
  timeToKillS: number;
}

export interface FightSummary {
  /** Kills the tracked player was credited with, in match order. */
  kills: KillEvent[];
  deaths: DeathEvent[];
  /** Total seconds spent waiting to respawn. */
  deadForS: number;
}

/** Null when the tracked player has no death record in the match. */
export function computeFights(
  rows: TrackerPlayerDeaths[],
  players: TrackerMatchPlayer[],
  accountId: number,
): FightSummary | null {
  const tracked = rows.find((row) => row.account_id === accountId);
  if (!tracked) return null;
  const playersById = new Map(players.map((player) => [player.account_id, player]));
  const playersBySlot = new Map(rows.map((row) => [row.player_slot, playersById.get(row.account_id)]));

  const kills: KillEvent[] = [];
  for (const row of rows) {
    const victim = playersById.get(row.account_id);
    if (!victim || row === tracked) continue;
    for (const death of row.death_details) {
      if (death.killer_player_slot === tracked.player_slot) kills.push({ time: death.game_time_s, victim });
    }
  }
  const deaths = tracked.death_details.map((death) => ({
    time: death.game_time_s,
    killer: (death.killer_player_slot != null && playersBySlot.get(death.killer_player_slot)) || null,
    deadForS: death.death_duration_s,
    timeToKillS: death.time_to_kill_s,
  }));
  const byTime = (a: { time: number }, b: { time: number }) => a.time - b.time;
  return {
    kills: kills.sort(byTime),
    deaths: deaths.sort(byTime),
    deadForS: deaths.reduce((sum, death) => sum + death.deadForS, 0),
  };
}
