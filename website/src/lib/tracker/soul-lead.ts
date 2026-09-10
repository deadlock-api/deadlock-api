import type { TrackerMatchPlayer } from "~/queries/tracker-queries";

export interface SoulLeadPoint {
  /** Seconds since the match started. */
  time: number;
  own: number;
  enemy: number;
  /** Own team net worth minus enemy team net worth. */
  lead: number;
}

export interface SoulLead {
  points: SoulLeadPoint[];
  peak: SoulLeadPoint;
  trough: SoulLeadPoint;
  /** Fraction of the match the own team was ahead, interpolating linearly between samples. */
  aheadShare: number;
}

/**
 * Team net worth lead over the match from the tracked team's point of view. Samples are aligned
 * across players in practice; a player missing a sample keeps their last known net worth. Null
 * without a timeline, or when neither team ever leads, as in Street Brawl, which pays both teams alike.
 */
export function computeSoulLead(players: TrackerMatchPlayer[], ownTeam: string): SoulLead | null {
  const times = new Set<number>();
  for (const player of players) for (const stat of player.stats) times.add(stat.time_stamp_s);
  if (times.size === 0) return null;

  const sorted = players.map((player) => ({
    own: player.team === ownTeam,
    stats: [...player.stats].sort((a, b) => a.time_stamp_s - b.time_stamp_s),
    cursor: 0,
    netWorth: 0,
  }));

  const points: SoulLeadPoint[] = [{ time: 0, own: 0, enemy: 0, lead: 0 }];
  for (const time of [...times].sort((a, b) => a - b)) {
    let own = 0;
    let enemy = 0;
    for (const player of sorted) {
      while (player.cursor < player.stats.length && player.stats[player.cursor].time_stamp_s <= time) {
        player.netWorth = player.stats[player.cursor].net_worth;
        player.cursor++;
      }
      if (player.own) own += player.netWorth;
      else enemy += player.netWorth;
    }
    points.push({ time, own, enemy, lead: own - enemy });
  }

  let peak = points[0];
  let trough = points[0];
  let aheadS = 0;
  for (let i = 1; i < points.length; i++) {
    const point = points[i];
    if (point.lead > peak.lead) peak = point;
    if (point.lead < trough.lead) trough = point;
    const previous = points[i - 1];
    const span = point.time - previous.time;
    if (previous.lead >= 0 && point.lead >= 0) aheadS += span;
    else if (previous.lead > 0 || point.lead > 0) {
      const crossing = span * (Math.abs(previous.lead) / (Math.abs(previous.lead) + Math.abs(point.lead)));
      aheadS += previous.lead > 0 ? crossing : span - crossing;
    }
  }
  if (peak.lead === 0 && trough.lead === 0) return null;
  const totalS = points[points.length - 1].time;
  return { points, peak, trough, aheadShare: totalS > 0 ? aheadS / totalS : 0 };
}
