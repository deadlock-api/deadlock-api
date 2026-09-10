import { type LaneInfo, LANES } from "~/lib/team-builder/lanes";
import type { TrackerMatchPlayer, TrackerMatchStat } from "~/queries/tracker-queries";

/** The laning phase has no fixed end in game; nine minutes is where this compares lanes. */
export const LANE_PHASE_END_S = 540;

export interface LanePlayer {
  player: TrackerMatchPlayer;
  /** The player's cumulative stats at the matchup's sample time. */
  stat: TrackerMatchStat;
}

export interface LaneMatchup {
  lane: LaneInfo;
  /** Seconds into the match the souls were sampled at: the laning phase end, or the last sample if earlier. */
  time: number;
  /** The tracked player's team in the lane, the tracked player first when it is their lane. */
  own: LanePlayer[];
  enemy: LanePlayer[];
  /** Own lane souls minus enemy lane souls at `time`. */
  diff: number;
}

const EMPTY_STAT: Omit<TrackerMatchStat, "time_stamp_s"> = {
  net_worth: 0,
  kills: 0,
  deaths: 0,
  assists: 0,
  creep_kills: 0,
  denies: 0,
  player_damage: 0,
};

/** The player's latest sample at or before `time`, zeroed before their first. */
function statAt(player: TrackerMatchPlayer, time: number): TrackerMatchStat {
  let latest: TrackerMatchStat | undefined;
  for (const stat of player.stats) {
    if (stat.time_stamp_s <= time && (!latest || stat.time_stamp_s > latest.time_stamp_s)) latest = stat;
  }
  return latest ?? { ...EMPTY_STAT, time_stamp_s: 0 };
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
  const total = (list: LanePlayer[]) => list.reduce((sum, entry) => sum + entry.stat.net_worth, 0);
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
    matchups.push({ lane, time, own, enemy, diff: total(own) - total(enemy) });
  }
  return matchups;
}
