import { createParser } from "nuqs";

import { type Dayjs, day } from "~/dayjs";
import { DEFAULT_DATE_FILTER, type DateFilterPreference, type DateRange } from "~/lib/date-filter-preference";
import { parseAsDayjsRange } from "~/lib/nuqs-parsers";
import type { PatchEntry } from "~/lib/patches";
import { currentSeason, previousSeasonRange, type SeasonInfo } from "~/lib/seasons";
import { normalizeUnixCeil, normalizeUnixFloor } from "~/lib/time-normalize";

/**
 * What a date filter selects: a patch or a ranked season by its id, or a custom range. A patch's and a season's
 * bounds come from their lists, so they are exact by construction; a custom range's are widened to whole UTC days.
 */
export type Period =
  | { kind: "patch"; id: string }
  | { kind: "season"; id: string }
  | { kind: "custom"; start?: Dayjs; end?: Dayjs };

/** The lists a period resolves against, both newest first: `fetchPatchList`'s patches and `toSeasons`' seasons. */
export interface PeriodLists {
  patches: readonly PatchEntry[];
  seasons: readonly SeasonInfo[];
}

/** Unix seconds as the analytics endpoints take them; an undefined end is open. */
export interface UnixBounds {
  minUnixTimestamp?: number;
  maxUnixTimestamp?: number;
}

export const ALL_TIME: Period = { kind: "custom" };

const PATCH_PREFIX = "patch:";
const SEASON_PREFIX = "season:";

export function customPeriod(start?: Dayjs, end?: Dayjs): Period {
  return { kind: "custom", start, end };
}

export function periodsEqual(a: Period, b: Period): boolean {
  if (a.kind === "custom" || b.kind === "custom") {
    return (
      a.kind === "custom" &&
      b.kind === "custom" &&
      a.start?.valueOf() === b.start?.valueOf() &&
      a.end?.valueOf() === b.end?.valueOf()
    );
  }
  return a.kind === b.kind && a.id === b.id;
}

/**
 * A period as `date_range`: `patch:2026-11-26`, `season:<id>`, or a custom range as `parseAsDayjsRange` writes it
 * (`start_end`, either end optional).
 */
export const parseAsPeriod = createParser<Period>({
  parse: (value: string) => {
    if (value.startsWith(PATCH_PREFIX)) {
      const id = value.slice(PATCH_PREFIX.length);
      return id ? { kind: "patch", id } : null;
    }
    if (value.startsWith(SEASON_PREFIX)) {
      const id = value.slice(SEASON_PREFIX.length);
      return id ? { kind: "season", id } : null;
    }
    const range = parseAsDayjsRange.parse(value);
    return range ? customPeriod(range[0], range[1]) : null;
  },
  serialize: (period: Period) => {
    switch (period.kind) {
      case "patch":
        return `${PATCH_PREFIX}${period.id}`;
      case "season":
        return `${SEASON_PREFIX}${period.id}`;
      case "custom":
        return parseAsDayjsRange.serialize([period.start, period.end]);
    }
  },
  eq: periodsEqual,
});

/** The period's own instants: a patch's or season's from its list, a custom range as written; undefined for an id the lists lack. */
export function periodRange(period: Period, lists: PeriodLists): DateRange | undefined {
  switch (period.kind) {
    case "patch": {
      const patch = lists.patches.find((candidate) => candidate.id === period.id);
      if (!patch) return undefined;
      return [day.unix(patch.startUnix), patch.endUnix === undefined ? undefined : day.unix(patch.endUnix)];
    }
    case "season": {
      const season = lists.seasons.find((candidate) => candidate.id === period.id);
      return season && [season.startDate, season.endDate];
    }
    case "custom":
      return [period.start, period.end];
  }
}

/** Whether an instant starts or ends a patch or a season of the lists. */
function isListBoundary(unix: number, lists: PeriodLists): boolean {
  return (
    lists.patches.some((patch) => patch.startUnix === unix || patch.endUnix === unix) ||
    lists.seasons.some(
      (season) =>
        season.startDate.unix() === unix || season.endDate?.unix() === unix || season.scheduledEndDate.unix() === unix,
    )
  );
}

/**
 * The bounds the analytics requests ask for: a patch's or season's exact instants, a custom range widened to whole
 * UTC days (nearby picks then share a cache key and the day rollups answer them). A custom bound that is a patch's or a
 * season's boundary stays exact too: a shared comparison pins the running season as `<its start>_<today>`.
 * Undefined for an id the lists lack.
 */
export function periodBounds(period: Period, lists: PeriodLists): UnixBounds | undefined {
  const range = periodRange(period, lists);
  if (!range) return undefined;
  const [start, end] = range;
  if (period.kind !== "custom") return { minUnixTimestamp: start?.unix(), maxUnixTimestamp: end?.unix() };
  const exact = (date: Dayjs) => isListBoundary(date.unix(), lists);
  return {
    minUnixTimestamp: start && exact(start) ? start.unix() : normalizeUnixFloor(start),
    maxUnixTimestamp: end && exact(end) ? end.unix() : normalizeUnixCeil(end),
  };
}

/**
 * The bounds a period is compared with: the patch or the season before it, or the equally long run of whole days right
 * before a custom range. Undefined for the oldest patch, an open custom range and an id the lists lack.
 */
export function previousBounds(period: Period, lists: PeriodLists): UnixBounds | undefined {
  switch (period.kind) {
    case "patch": {
      const index = lists.patches.findIndex((patch) => patch.id === period.id);
      const patch = lists.patches[index];
      const previous = lists.patches[index + 1];
      if (index < 0 || !patch || !previous) return undefined;
      return { minUnixTimestamp: previous.startUnix, maxUnixTimestamp: patch.startUnix };
    }
    case "season": {
      const index = lists.seasons.findIndex((season) => season.id === period.id);
      if (index < 0) return undefined;
      const [start, end] = previousSeasonRange(lists.seasons, index);
      return { minUnixTimestamp: start.unix(), maxUnixTimestamp: end.unix() };
    }
    case "custom": {
      const bounds = periodBounds(period, lists);
      if (bounds?.minUnixTimestamp === undefined || bounds.maxUnixTimestamp === undefined) return undefined;
      // Whole days, up to the last second before the range: the bounds of a day rollup, never 00:00:01.
      const length = bounds.maxUnixTimestamp + 1 - bounds.minUnixTimestamp;
      return { minUnixTimestamp: bounds.minUnixTimestamp - length, maxUnixTimestamp: bounds.minUnixTimestamp - 1 };
    }
  }
}

/**
 * A custom range that is exactly a season or a patch, to the second, as that period: the links from before periods had
 * names (`date_range=<start>_<end>`), so they keep their exact bounds and their numbers.
 */
export function canonicalPeriod(period: Period, lists: PeriodLists): Period {
  if (period.kind !== "custom" || !period.start) return period;
  const start = period.start.unix();
  const end = period.end?.unix();
  const season = lists.seasons.find(
    (candidate) => candidate.startDate.unix() === start && candidate.endDate?.unix() === end,
  );
  if (season) return { kind: "season", id: season.id };
  const patch = lists.patches.find((candidate) => candidate.startUnix === start && candidate.endUnix === end);
  if (patch) return { kind: "patch", id: patch.id };
  return period;
}

/**
 * The period a `date_range` selects: a link from before periods had names spells a patch or a season out as its
 * instants and reads as that period; none, or an id the lists do not have (a mistyped link, the feed down), is
 * `fallback`. The page and its loader both read the URL through here, so they ask for the same bounds.
 */
export function resolvePeriod(picked: Period | null | undefined, lists: PeriodLists, fallback: Period): Period {
  const period = picked ? canonicalPeriod(picked, lists) : undefined;
  return period && periodRange(period, lists) ? period : fallback;
}

/** The period every date filter starts at: the current season, or the latest patch (also without a season). */
export function defaultPeriod(lists: PeriodLists, preference: DateFilterPreference = DEFAULT_DATE_FILTER): Period {
  const season = preference === "season" ? currentSeason(lists.seasons) : undefined;
  if (season) return { kind: "season", id: season.id };
  const patch = lists.patches[0];
  return patch ? { kind: "patch", id: patch.id } : ALL_TIME;
}

/** `defaultPeriod`'s request bounds, shared by the loaders' prefetches and the hydrated UI; an open start reads from 0. */
export function defaultUnixRange(lists: PeriodLists, preference: DateFilterPreference = DEFAULT_DATE_FILTER) {
  const bounds = periodBounds(defaultPeriod(lists, preference), lists);
  return { minUnixTimestamp: bounds?.minUnixTimestamp ?? 0, maxUnixTimestamp: bounds?.maxUnixTimestamp };
}

/**
 * The bounds `defaultPeriod` is compared with. With nothing before it (a patch list of one, which the curated patches
 * alone already exceed) an empty window.
 */
export function defaultPrevUnixRange(lists: PeriodLists, preference: DateFilterPreference = DEFAULT_DATE_FILTER) {
  const bounds = previousBounds(defaultPeriod(lists, preference), lists);
  return { minUnixTimestamp: bounds?.minUnixTimestamp ?? 0, maxUnixTimestamp: bounds?.maxUnixTimestamp ?? 0 };
}

/** `defaultPeriod` as an ISO 8601 interval for Dataset `temporalCoverage`, open-ended ("2026-08-21/..") while it runs. */
export function defaultTemporalCoverage(
  lists: PeriodLists,
  preference: DateFilterPreference = DEFAULT_DATE_FILTER,
): string | undefined {
  const [start, end] = periodRange(defaultPeriod(lists, preference), lists) ?? [];
  if (!start) return undefined;
  return `${start.utc().format("YYYY-MM-DD")}/${end ? end.utc().format("YYYY-MM-DD") : ".."}`;
}

/** How copy names `defaultPeriod`: "this season", or "the current patch" (also the fallback without a season). */
export function defaultPeriodLabel(
  lists: PeriodLists,
  preference: DateFilterPreference = DEFAULT_DATE_FILTER,
): "this season" | "the current patch" {
  return defaultPeriod(lists, preference).kind === "season" ? "this season" : "the current patch";
}

/** The latest patch as titles name it: "Nov 26 Patch" (its release day, UTC). */
export function currentPatchLabel(lists: PeriodLists): string {
  const patch = lists.patches[0];
  return patch ? `${day.utc(patch.id).format("MMM D")} Patch` : "Current Patch";
}

/**
 * `defaultPeriod` as titles name it: the running season as players search for it ("Season 2", without the API's
 * "Beta" prefix), or the latest patch ("Nov 26 Patch") when the period is a patch.
 */
export function defaultPeriodTitle(lists: PeriodLists, preference: DateFilterPreference = DEFAULT_DATE_FILTER): string {
  const period = defaultPeriod(lists, preference);
  const season = period.kind === "season" ? lists.seasons.find((candidate) => candidate.id === period.id) : undefined;
  return season ? season.name.replace(/^beta\s+/i, "") : currentPatchLabel(lists);
}

/** The same human-readable label in the picker and the compact filter summaries. */
export function periodLabel(period: Period, lists: PeriodLists): string {
  if (period.kind === "season") {
    return lists.seasons.find((season) => season.id === period.id)?.name ?? `Season ${period.id}`;
  }
  if (period.kind === "patch") {
    return lists.patches.find((patch) => patch.id === period.id)?.name ?? `Patch ${period.id}`;
  }
  const { start: startDate, end: endDate } = period;
  if (!startDate && !endDate) return "All Time";
  // The "Last 24h" preset: an open range starting on the hour a day back.
  if (startDate && !endDate && day().diff(startDate, "hour", true) <= 25) return "Last 24h";
  // The year only when it is not this one: "Jan 1 - Feb 1" for a range in 2030 read as this January.
  const thisYear = day().year();
  const withYear = [startDate, endDate].some((date) => date && date.year() !== thisYear);
  const format = (date: Dayjs) => date.format(withYear ? "MMM D, YYYY" : "MMM D");
  if (startDate && endDate) return `${format(startDate)} - ${format(endDate)}`;
  if (startDate) return `since ${format(startDate)}`;
  return `until ${format(endDate!)}`;
}
