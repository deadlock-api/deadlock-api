import { type LaneInfo, LANES } from "~/lib/team-builder/lanes";
import type { TrackerMatchPlayer } from "~/queries/tracker-queries";

/** The laning phase has no fixed end in game; nine minutes is where this compares lanes. */
export const LANE_PHASE_END_S = 540;

export interface LanePlayerSouls {
  player: TrackerMatchPlayer;
  souls: number;
}

export interface LaneMatchup {
  lane: LaneInfo;
  /** Seconds into the match the souls were sampled at: the laning phase end, or the last sample if earlier. */
  time: number;
  /** The tracked player's team in the lane, the tracked player first when it is their lane. */
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

/**
 * Every lane's matchup from the tracked player's team, in `LANES` order, all sampled at the same time. Lanes
 * without players on both sides are left out; empty when the tracked player is missing or there is no soul timeline.
 */
export function computeLaneMatchups(players: TrackerMatchPlayer[], accountId: number): LaneMatchup[] {
  const tracked = players.find((player) => player.account_id === accountId);
  if (!tracked) return [];

  let lastSample = 0;
  for (const player of players) for (const stat of player.stats) lastSample = Math.max(lastSample, stat.time_stamp_s);
  if (lastSample === 0) return [];
  const time = Math.min(LANE_PHASE_END_S, lastSample);

  const withSouls = (player: TrackerMatchPlayer): LanePlayerSouls => ({ player, souls: netWorthAt(player, time) });
  const total = (list: LanePlayerSouls[]) => list.reduce((sum, entry) => sum + entry.souls, 0);
  const matchups: LaneMatchup[] = [];
  for (const lane of LANES) {
    const laners = players.filter((player) => player.assigned_lane === lane.id);
    const ownPlayers = laners
      .filter((player) => player.team === tracked.team)
      .toSorted((a, b) => Number(b === tracked) - Number(a === tracked));
    const enemyPlayers = laners.filter((player) => player.team !== tracked.team);
    if (ownPlayers.length === 0 || enemyPlayers.length === 0) continue;
    const own = ownPlayers.map(withSouls);
    const enemy = enemyPlayers.map(withSouls);
    matchups.push({ lane, time, own, enemy, diff: total(own) - total(enemy) });
  }
  return matchups;
}
