import { type LaneInfo, LANES } from "~/lib/team-builder/lanes";
import type { TrackerMatchPlayer } from "~/queries/tracker-queries";

/** The laning phase has no fixed end in game; ten minutes is the usual point of comparison. */
export const LANE_PHASE_END_S = 600;

export interface LanePlayerSouls {
  player: TrackerMatchPlayer;
  souls: number;
}

export interface LaneMatchup {
  lane: LaneInfo;
  /** Seconds into the match the souls were sampled at: the laning phase end, or the last sample if earlier. */
  time: number;
  /** The tracked player first, then their lane partner. */
  own: LanePlayerSouls[];
  enemy: LanePlayerSouls[];
  /** Own lane souls minus enemy lane souls at `time`. */
  diff: number;
}

function netWorthAt(player: TrackerMatchPlayer, time: number): number {
  let netWorth = 0;
  let latest = -1;
  for (const stat of player.stats) {
    if (stat.time_stamp_s <= time && stat.time_stamp_s > latest) {
      latest = stat.time_stamp_s;
      netWorth = stat.net_worth;
    }
  }
  return netWorth;
}

/** Null when the tracked player has no lane, no opponents in it, or the match has no soul timeline. */
export function computeLaneMatchup(players: TrackerMatchPlayer[], accountId: number): LaneMatchup | null {
  const tracked = players.find((player) => player.account_id === accountId);
  if (!tracked) return null;
  const lane = LANES.find((candidate) => candidate.id === tracked.assigned_lane);
  if (!lane) return null;

  const laners = players.filter((player) => player.assigned_lane === lane.id);
  const ownPlayers = [tracked, ...laners.filter((player) => player.team === tracked.team && player !== tracked)];
  const enemyPlayers = laners.filter((player) => player.team !== tracked.team);
  if (enemyPlayers.length === 0) return null;

  let lastSample = 0;
  for (const player of laners) for (const stat of player.stats) lastSample = Math.max(lastSample, stat.time_stamp_s);
  if (lastSample === 0) return null;
  const time = Math.min(LANE_PHASE_END_S, lastSample);

  const withSouls = (player: TrackerMatchPlayer): LanePlayerSouls => ({ player, souls: netWorthAt(player, time) });
  const own = ownPlayers.map(withSouls);
  const enemy = enemyPlayers.map(withSouls);
  const total = (list: LanePlayerSouls[]) => list.reduce((sum, entry) => sum + entry.souls, 0);
  return { lane, time, own, enemy, diff: total(own) - total(enemy) };
}
