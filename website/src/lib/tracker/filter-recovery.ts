import type { PlayerMatchHistoryEntry } from "deadlock_api_client";

import { filterMatches, type TrackerFilterValues } from "./compute";

export interface FilterRecovery {
  label: string;
  matches: number;
  filters: TrackerFilterValues;
}

/** Suggest only changes that actually reveal matches, preferring to loosen one filter at a time. */
export function filterRecoveryOptions(
  entries: PlayerMatchHistoryEntry[],
  filters: TrackerFilterValues,
): FilterRecovery[] {
  const candidates: { label: string; filters: TrackerFilterValues }[] = [];
  if (filters.minUnixTimestamp != null || filters.maxUnixTimestamp != null) {
    candidates.push({
      label: "Show all dates",
      filters: { ...filters, minUnixTimestamp: null, maxUnixTimestamp: null },
    });
  }
  if (filters.heroId != null) candidates.push({ label: "Show all heroes", filters: { ...filters, heroId: null } });
  if (filters.result !== "all") {
    candidates.push({ label: "Include wins and losses", filters: { ...filters, result: "all" } });
  }
  if (filters.mode === "normal_ranked" || filters.mode === "normal_unranked") {
    candidates.push({ label: "Include ranked and unranked", filters: { ...filters, mode: "normal_all" } });
  }
  candidates.push({
    label: filters.mode === "street_brawl" ? "Switch to normal matches" : "Switch to Brawl",
    filters: { ...filters, mode: filters.mode === "street_brawl" ? "normal_all" : "street_brawl" },
  });

  const withCounts = (options: typeof candidates) =>
    options
      .map((option) => ({ ...option, matches: filterMatches(entries, option.filters).length }))
      .filter((option) => option.matches > 0);
  const singleChanges = withCounts(candidates);
  if (singleChanges.length > 0) return singleChanges.slice(0, 3);

  // Several filters can jointly hide everything. Keep the fallback explicit about both mode and date scope.
  const modes =
    filters.mode === "street_brawl"
      ? (["street_brawl", "normal_all"] as const)
      : (["normal_all", "street_brawl"] as const);
  return withCounts(
    modes.map((mode) => ({
      label: mode === "normal_all" ? "Show all normal matches" : "Show all Brawl matches",
      filters: { mode, heroId: null, result: "all", minUnixTimestamp: null, maxUnixTimestamp: null },
    })),
  );
}
