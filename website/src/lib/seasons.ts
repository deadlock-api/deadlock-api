import type { RankedSeason } from "deadlock_api_client";

import { type Dayjs, day } from "~/dayjs";
import { PATCHES, type PatchInfo } from "~/lib/constants";
import type { DateFilterPreference, DateRange } from "~/lib/date-filter-preference";
import { normalizeUnixCeil, normalizeUnixFloor, registerExactBoundaries } from "~/lib/time-normalize";

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

/** The selected current period, with a patch fallback when seasons are unavailable. */
export function defaultDateRange(
  seasons: readonly SeasonInfo[],
  preference: DateFilterPreference = "season",
): DateRange {
  const season = preference === "season" ? currentSeason(seasons) : undefined;
  return season ? [season.startDate, season.endDate] : [PATCHES[0].startDate, PATCHES[0].endDate];
}

export function defaultPrevDateRange(
  seasons: readonly SeasonInfo[],
  preference: DateFilterPreference = "season",
): DateRange {
  return preference === "season" && currentSeason(seasons)
    ? previousSeasonRange(seasons, 0)
    : [PATCHES[1].startDate, PATCHES[0].startDate];
}

/** Exact bounds shared by server prefetching and the hydrated UI. */
export function defaultUnixRange(seasons: readonly SeasonInfo[], preference: DateFilterPreference = "season") {
  const [start, end] = defaultDateRange(seasons, preference);
  return { minUnixTimestamp: normalizeUnixFloor(start) ?? 0, maxUnixTimestamp: normalizeUnixCeil(end) };
}

export function defaultPrevUnixRange(seasons: readonly SeasonInfo[], preference: DateFilterPreference = "season") {
  const [start, end] = defaultPrevDateRange(seasons, preference);
  return { minUnixTimestamp: normalizeUnixFloor(start) ?? 0, maxUnixTimestamp: normalizeUnixCeil(end) };
}

export function patchMatches(patch: PatchInfo, startDate: Dayjs, endDate?: Dayjs): boolean {
  if (!patch.startDate.isSame(startDate, "day")) return false;
  if (patch.endDate === undefined) return endDate === undefined;
  return endDate !== undefined && patch.endDate.isSame(endDate, "day");
}

// Seasons match to the second, unlike patches: a season can begin on the same
// day as the patch that starts it, and day-granularity matching would then
// report the patch selection as its season.
export function seasonMatches(season: SeasonInfo, startDate: Dayjs, endDate?: Dayjs): boolean {
  if (season.startDate.unix() !== startDate.unix()) return false;
  if (season.endDate === undefined) return endDate === undefined;
  return endDate !== undefined && season.endDate.unix() === endDate.unix();
}

/** The same human-readable date label in the picker and compact filter summaries. */
export function dateRangeLabel(
  { startDate, endDate }: { startDate?: Dayjs; endDate?: Dayjs },
  { seasons = [], patches = [] }: { seasons?: readonly SeasonInfo[]; patches?: readonly PatchInfo[] } = {},
): string {
  const season = startDate && seasons.find((candidate) => seasonMatches(candidate, startDate, endDate));
  if (season) return season.name;
  const patch = startDate && patches.find((candidate) => patchMatches(candidate, startDate, endDate));
  if (patch) return patch.name;
  if (!startDate && !endDate) return "All Time";
  if (startDate && endDate) return `${startDate.format("MMM D")} - ${endDate.format("MMM D")}`;
  if (startDate) return `since ${startDate.format("MMM D")}`;
  return `until ${endDate!.format("MMM D")}`;
}

export function computePreviousPeriod(
  startDate?: Dayjs,
  endDate?: Dayjs,
  ranges?: { seasons?: readonly SeasonInfo[]; patches?: readonly PatchInfo[] },
): { prevStartDate?: Dayjs; prevEndDate?: Dayjs } {
  if (!startDate) return {};

  const seasons = ranges?.seasons;
  if (seasons) {
    const seasonIndex = seasons.findIndex((season) => seasonMatches(season, startDate, endDate));
    if (seasonIndex >= 0) {
      const [prevStartDate, prevEndDate] = previousSeasonRange(seasons, seasonIndex);
      return { prevStartDate, prevEndDate };
    }
  }

  const patches = ranges?.patches;
  if (patches) {
    const patchIndex = patches.findIndex((patch) => patchMatches(patch, startDate, endDate));
    if (patchIndex >= 0 && patchIndex + 1 < patches.length) {
      const prevPatch = patches[patchIndex + 1];
      return {
        prevStartDate: prevPatch.startDate,
        prevEndDate: patches[patchIndex].startDate,
      };
    }
  }

  if (!endDate) return {};
  // Duration shift fallback for custom ranges.
  const durationSeconds = endDate.unix() - startDate.unix();
  return {
    prevStartDate: startDate.subtract(durationSeconds, "second"),
    prevEndDate: startDate,
  };
}
