import type { RankedSeason } from "deadlock_api_client";

import { type Dayjs, day } from "~/dayjs";
import { PATCHES } from "~/lib/constants";
import { registerExactBoundaries } from "~/lib/time-normalize";

export interface SeasonInfo {
  id: string;
  name: string;
  startDate: Dayjs;
  // Undefined = season is still running (open-ended), mirroring the active patch.
  endDate?: Dayjs;
  scheduledEndDate: Dayjs;
}

/**
 * Collapses each season's intervals into a single range and drops seasons that
 * haven't started yet — the client ships their definitions ahead of time.
 * Newest first, matching `PATCHES`.
 */
export function toSeasons(raw: readonly RankedSeason[]): SeasonInfo[] {
  const now = day();
  const seasons = raw
    .filter((season) => season.intervals.length > 0)
    .map((season) => {
      const startDate = day.unix(Math.min(...season.intervals.map((i) => i.start_timestamp)));
      const scheduledEndDate = day.unix(Math.max(...season.intervals.map((i) => i.end_timestamp)));
      return {
        id: season.class_name,
        name: season.name,
        startDate,
        endDate: scheduledEndDate.isAfter(now) ? undefined : scheduledEndDate,
        scheduledEndDate,
      };
    })
    .filter((season) => !season.startDate.isAfter(now))
    .sort((a, b) => b.startDate.unix() - a.startDate.unix());

  registerExactBoundaries(seasons.flatMap((s) => [s.startDate.unix(), s.scheduledEndDate.unix()]));
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

/** Default filter range: the current ranked season, falling back to the current patch. */
export function defaultDateRange(seasons: readonly SeasonInfo[]): [Dayjs | undefined, Dayjs | undefined] {
  const season = currentSeason(seasons);
  if (!season) return [PATCHES[0].startDate, PATCHES[0].endDate];
  return [season.startDate, season.endDate];
}

export function defaultPrevDateRange(seasons: readonly SeasonInfo[]): [Dayjs | undefined, Dayjs | undefined] {
  if (!currentSeason(seasons)) return [PATCHES[1].startDate, PATCHES[0].startDate];
  return previousSeasonRange(seasons, 0);
}
