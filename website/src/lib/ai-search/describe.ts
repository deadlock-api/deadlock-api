import type { Region, SelectionMode, SelectionTime } from "~/lib/page-registry";

import type { SearchIntent } from "./intent";

const MODE_LABELS: Record<SelectionMode, string> = {
  ranked: "Ranked",
  unranked: "Unranked",
  street_brawl: "Street Brawl",
};

const TIME_LABELS: Record<SelectionTime, string> = {
  current_patch: "This patch",
  previous_patch: "Last patch",
  current_season: "This season",
  previous_season: "Last season",
  last_7_days: "Last 7 days",
  last_30_days: "Last 30 days",
};

const REGION_LABELS: Record<Region, string> = {
  Europe: "Europe",
  Asia: "Asia",
  NAmerica: "North America",
  SAmerica: "South America",
  Oceania: "Oceania",
};

function rankLabel(min: string | null, max: string | null): string | undefined {
  if (min && max) return min === max ? min : `${min} to ${max}`;
  if (min) return `${min}+`;
  if (max) return `Up to ${max}`;
  return undefined;
}

/** What a page opens filtered by, in a few words each ("Abrams", "vs Haze", "Eternus+", "This patch"), for its suggestion. */
export function describeIntent(intent: SearchIntent): string[] {
  return [
    ...intent.heroes,
    ...intent.enemy_heroes.map((hero) => `vs ${hero}`),
    ...intent.items,
    ...(intent.item_tiers.length > 0 ? [`Tier ${intent.item_tiers.join(", ")}`] : []),
    rankLabel(intent.rank_min, intent.rank_max),
    intent.mode ? MODE_LABELS[intent.mode] : undefined,
    intent.time ? TIME_LABELS[intent.time] : undefined,
    intent.region ? REGION_LABELS[intent.region] : undefined,
  ].filter((label): label is string => label !== undefined);
}
