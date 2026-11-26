import type { RankedSeason } from "deadlock_api_client";

import { type Dayjs, day } from "~/dayjs";

export interface SeasonInfo {
  id: string;
  name: string;
  startDate: Dayjs;
  // Undefined = season is still running (open-ended), mirroring the active patch.
  endDate?: Dayjs;
  scheduledEndDate: Dayjs;
  /** The leaderboard of the season's latest started interval, for `/v1/leaderboard`'s `leaderboard_id`. */
  leaderboardId?: number;
}

/**
 * Collapses each season's intervals into a single range and drops seasons that
 * haven't started yet — the client ships their definitions ahead of time.
 * Newest first, like the patch list.
 */
export function toSeasons(raw: readonly RankedSeason[]): SeasonInfo[] {
  const now = day();
  const seasons = raw
    .filter((season) => season.intervals.length > 0)
    .map((season) => {
      const startDate = day.unix(Math.min(...season.intervals.map((i) => i.start_timestamp)));
      const scheduledEndDate = day.unix(Math.max(...season.intervals.map((i) => i.end_timestamp)));
      const leaderboardId = season.intervals
        .filter((i) => i.leaderboard_id != null && i.start_timestamp <= now.unix())
        .toSorted((a, b) => b.start_timestamp - a.start_timestamp)[0]?.leaderboard_id;
      return {
        id: season.class_name,
        name: season.name,
        startDate,
        endDate: scheduledEndDate.isAfter(now) ? undefined : scheduledEndDate,
        scheduledEndDate,
        leaderboardId: leaderboardId ?? undefined,
      };
    })
    .filter((season) => !season.startDate.isAfter(now))
    .sort((a, b) => b.startDate.unix() - a.startDate.unix());
  return seasons;
}

export function currentSeason(seasons: readonly SeasonInfo[]): SeasonInfo | undefined {
  return seasons[0];
}

export function seasonContaining(seasons: readonly SeasonInfo[], date: Dayjs): SeasonInfo | undefined {
  return seasons.find((season) => !season.startDate.isAfter(date) && !season.scheduledEndDate.isBefore(date));
}

/**
 * Comparison baseline for a season: the preceding season, or — for the first
 * one on record — the equally long window right before it. The length comes
 * from the *scheduled* end so an ongoing season doesn't make this depend on the
 * current time, which would desync SSR and hydration query keys.
 */
export function previousSeasonRange(seasons: readonly SeasonInfo[], index: number): [Dayjs, Dayjs] {
  const season = seasons[index];
  const previous = seasons[index + 1];
  if (previous) return [previous.startDate, previous.endDate ?? season.startDate];
  const lengthSeconds = season.scheduledEndDate.unix() - season.startDate.unix();
  return [season.startDate.subtract(lengthSeconds, "second"), season.startDate];
}
