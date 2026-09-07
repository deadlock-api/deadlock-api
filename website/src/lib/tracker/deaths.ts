import type { TrackerMatchDeath, TrackerMatchPlayer } from "~/queries/tracker-queries";

export interface DeathEvent {
  /** Seconds since the match started. */
  time: number;
  /** Null when no player was credited with the kill. */
  killer: TrackerMatchPlayer | null;
  /** Seconds until the respawn. */
  deadForS: number;
  timeToKillS: number;
}

export interface DeathSummary {
  deaths: DeathEvent[];
  /** Total seconds spent waiting to respawn. */
  deadForS: number;
}

/** The tracked player's deaths in match order, with killers resolved against the lobby. */
export function computeDeaths(details: TrackerMatchDeath[], players: TrackerMatchPlayer[]): DeathSummary {
  const bySlot = new Map(players.map((player) => [player.player_slot, player]));
  const deaths = details
    .map((death) => ({
      time: death.game_time_s,
      killer: (death.killer_player_slot != null && bySlot.get(death.killer_player_slot)) || null,
      deadForS: death.death_duration_s,
      timeToKillS: death.time_to_kill_s,
    }))
    .sort((a, b) => a.time - b.time);
  return { deaths, deadForS: deaths.reduce((sum, death) => sum + death.deadForS, 0) };
}
