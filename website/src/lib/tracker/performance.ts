import type { PlayerMatchHistoryEntry } from "deadlock_api_client";

import type { TrackerMatchPlayer } from "~/queries/tracker-queries";

import { formatMatchDuration, kdaRatio, soulsPerMinute, type TrackerSummary } from "./compute";

export interface PerformanceStat {
  label: string;
  value: string;
  /** A second line under the value, such as the share of a team total. */
  note?: string;
  /** This match over the player's average, or null when nothing comparable was measured. */
  ratio: number | null;
  /** The average the ratio compares against, formatted. */
  average?: string;
}

const count = (value: number) => Math.round(value).toLocaleString("en-US");
const share = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

function compare(value: number, average: number | undefined): Pick<PerformanceStat, "ratio" | "average"> {
  if (average == null || average <= 0) return { ratio: null };
  return { ratio: value / average, average: average < 10 ? average.toFixed(2) : count(average) };
}

/**
 * The tracked player's own line in a match: what the history row alone cannot say, next to their average
 * over the rest of the filtered history. Stats that need the match metadata are left out until it loads.
 */
export function performanceStats({
  entry,
  player,
  teammates,
  deadForS,
  baseline,
}: {
  entry: PlayerMatchHistoryEntry;
  /** The tracked player in the match metadata, absent while it loads or when the match omits them. */
  player: TrackerMatchPlayer | undefined;
  /** Every player on the tracked player's team, for the shares. */
  teammates: TrackerMatchPlayer[];
  /** Seconds the tracked player spent waiting to respawn, or null when the match records no deaths. */
  deadForS: number | null;
  /** Averages over the filtered history without this match, or null when too few matches to mean anything. */
  baseline: TrackerSummary | null;
}): PerformanceStat[] {
  const kda = kdaRatio(entry);
  const soulsPerMin = soulsPerMinute(entry);
  const stats: PerformanceStat[] = [
    { label: "KDA", value: kda.toFixed(2), ...compare(kda, baseline?.kdaRatio) },
    { label: "Souls/min", value: count(soulsPerMin), ...compare(soulsPerMin, baseline?.soulsPerMin) },
    { label: "Last hits", value: count(entry.last_hits), ...compare(entry.last_hits, baseline?.avgLastHits) },
    { label: "Denies", value: count(entry.denies), ...compare(entry.denies, baseline?.avgDenies) },
  ];

  if (player) {
    const teamKills = teammates.reduce((sum, mate) => sum + mate.kills, 0);
    const teamDamage = teammates.reduce((sum, mate) => sum + mate.player_damage, 0);
    stats.push(
      {
        label: "Kill share",
        value: `${share(player.kills + player.assists, teamKills)}%`,
        note: `${count(player.kills + player.assists)} of ${count(teamKills)} kills`,
        ratio: null,
      },
      {
        label: "Hero damage",
        value: count(player.player_damage),
        note: `${share(player.player_damage, teamDamage)}% of the team`,
        ratio: null,
      },
    );
  }

  if (deadForS != null && entry.match_duration_s > 0) {
    stats.push({
      label: "Time dead",
      value: formatMatchDuration(deadForS),
      note: `${share(deadForS, entry.match_duration_s)}% of the match`,
      ratio: null,
    });
  }

  return stats;
}
