import { type LaneInfo, LANES } from "~/lib/team-builder/lanes";
import type { TrackerMatchPlayer, TrackerMatchStat } from "~/queries/tracker-queries";

/** The laning phase has no fixed end in game; nine minutes is where this compares lanes. */
export const LANE_PHASE_END_S = 540;

export interface LanePlayer {
  player: TrackerMatchPlayer;
  /** The latest recorded stats at or before the comparison time; null when unavailable. */
  stat: TrackerMatchStat | null;
}

export interface LaneMatchup {
  lane: LaneInfo;
  /** Seconds into the match the souls were sampled at: the laning phase end, or the last sample if earlier. */
  time: number;
  /** The tracked player's team in the lane, the tracked player first when it is their lane. */
  own: LanePlayer[];
  enemy: LanePlayer[];
  /** Own lane souls minus enemy lane souls at `time`, or null when any laner's sample is missing. */
  diff: number | null;
}

/** A missing sample says nothing about how many souls a player had. */
function statAt(player: TrackerMatchPlayer, time: number): TrackerMatchStat | null {
  let latest: TrackerMatchStat | undefined;
  for (const stat of player.stats) {
    if (stat.time_stamp_s <= time && (!latest || stat.time_stamp_s > latest.time_stamp_s)) latest = stat;
  }
  return latest ?? null;
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

  const withStat = (player: TrackerMatchPlayer): LanePlayer => ({ player, stat: statAt(player, time) });
  const total = (list: LanePlayer[]) => {
    let souls = 0;
    for (const entry of list) {
      if (!entry.stat) return null;
      souls += entry.stat.net_worth;
    }
    return souls;
  };
  const matchups: LaneMatchup[] = [];
  for (const lane of LANES) {
    const laners = players.filter((player) => player.assigned_lane === lane.id);
    const ownPlayers = laners
      .filter((player) => player.team === tracked.team)
      .toSorted((a, b) => Number(b === tracked) - Number(a === tracked));
    const enemyPlayers = laners.filter((player) => player.team !== tracked.team);
    if (ownPlayers.length === 0 || enemyPlayers.length === 0) continue;
    const own = ownPlayers.map(withStat);
    const enemy = enemyPlayers.map(withStat);
    const ownTotal = total(own);
    const enemyTotal = total(enemy);
    matchups.push({
      lane,
      time,
      own,
      enemy,
      diff: ownTotal == null || enemyTotal == null ? null : ownTotal - enemyTotal,
    });
  }
  return matchups;
}
