import type { IntentMode, IntentRegion, IntentTime } from "./intent";
import { PAGE_IDS, PAGES, type PageId } from "./pages";

// What the model has decided so far, read from its answer while it still streams in, so the search can show its
// reading of the question as it forms: "Hero counters · Bebop · this patch". Only values that have fully arrived are
// shown; a half-written name never flashes up.

const TIME_LABELS: Record<IntentTime, string | undefined> = {
  default: undefined,
  current_patch: "this patch",
  previous_patch: "previous patch",
  current_season: "this season",
  previous_season: "last season",
  last_7_days: "last 7 days",
  last_30_days: "last 30 days",
};

const MODE_LABELS: Record<IntentMode, string | undefined> = {
  default: undefined,
  ranked: "ranked",
  unranked: "unranked",
  street_brawl: "Street Brawl",
};

const REGION_LABELS: Record<IntentRegion, string> = {
  Europe: "Europe",
  Asia: "Asia",
  NAmerica: "North America",
  SAmerica: "South America",
  Oceania: "Oceania",
};

function stringField(text: string, key: string): string | undefined {
  return new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`).exec(text)?.[1];
}

function arrayField(text: string, key: string): string[] {
  const body = new RegExp(`"${key}"\\s*:\\s*\\[([^\\]]*)`).exec(text)?.[1] ?? "";
  return [...body.matchAll(/"([^"]*)"/g)].map((match) => match[1]);
}

function rankLabel(min: string | undefined, max: string | undefined): string | undefined {
  if (min && max) return min === max ? min : `${min} to ${max}`;
  if (min) return `${min}+`;
  if (max) return `up to ${max}`;
  return undefined;
}

/** The parts of the reading so far, in the order the answer gives them. Empty until the page has arrived. */
export function describePartialAnswer(text: string): string[] {
  const page = stringField(text, "page");
  if (!PAGE_IDS.includes(page as PageId)) return [];
  const heroes = arrayField(text, "heroes");
  const enemies = arrayField(text, "enemy_heroes");
  const parts = [
    PAGES[page as PageId].label,
    heroes.length > 0 ? heroes.join(", ") : undefined,
    enemies.length > 0 ? `vs ${enemies.join(", ")}` : undefined,
    ...arrayField(text, "items"),
    rankLabel(stringField(text, "rank_min"), stringField(text, "rank_max")),
    MODE_LABELS[stringField(text, "mode") as IntentMode],
    TIME_LABELS[stringField(text, "time") as IntentTime],
    REGION_LABELS[stringField(text, "region") as IntentRegion],
  ];
  return parts.filter((part): part is string => Boolean(part));
}
