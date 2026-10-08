import { type GameMode, hasSoulEconomy } from "~/lib/game-mode";

export type SortVariant = "avg" | "max" | "total";

interface SortCategory {
  label: string;
  key: string;
  variants?: readonly SortVariant[];
  /** Only the player scoreboard can sort by it; the hero scoreboard API answers 400. */
  playersOnly?: boolean;
  /** Measures the soul economy, which Street Brawl does not have. */
  economy?: boolean;
}

/** Which scoreboard a sort is for: the hero one has no player rank. */
export type ScoreboardScope = "players" | "heroes";

export function buildSortByValue(key: string, variant?: SortVariant): string {
  if (!variant) return key;
  switch (variant) {
    case "avg":
      return `avg_${key}_per_match`;
    case "max":
      return `max_${key}_per_match`;
    case "total":
      return key;
  }
}

export function parseSortByValue(sortBy: string): { key: string; variant?: SortVariant } {
  if (sortBy.startsWith("avg_") && sortBy.endsWith("_per_match")) {
    return { key: sortBy.slice(4, -10), variant: "avg" };
  }
  if (sortBy.startsWith("max_") && sortBy.endsWith("_per_match")) {
    return { key: sortBy.slice(4, -10), variant: "max" };
  }
  const cat = SORT_CATEGORIES.find((c) => c.key === sortBy && c.variants);
  if (cat) {
    return { key: sortBy, variant: "total" };
  }
  return { key: sortBy };
}

const ALL_VARIANTS: readonly SortVariant[] = ["avg", "max", "total"];

const CATEGORIES = [
  { label: "Matches", key: "matches" },
  // `rank` is the badge of the latest ranked match in range, `peak_rank` the highest one.
  { label: "Current Rank", key: "rank", playersOnly: true },
  { label: "Peak Rank", key: "peak_rank", playersOnly: true },
  { label: "Wins", key: "wins" },
  { label: "Losses", key: "losses" },
  { label: "Winrate", key: "winrate" },
  { label: "Kills", key: "kills", variants: ALL_VARIANTS },
  { label: "Deaths", key: "deaths", variants: ALL_VARIANTS },
  { label: "Assists", key: "assists", variants: ALL_VARIANTS },
  { label: "Net Worth", key: "net_worth", variants: ALL_VARIANTS, economy: true },
  { label: "Last Hits", key: "last_hits", variants: ALL_VARIANTS },
  { label: "Denies", key: "denies", variants: ALL_VARIANTS },
  { label: "Player Damage", key: "player_damage", variants: ALL_VARIANTS },
  { label: "Creep Damage", key: "creep_damage", variants: ALL_VARIANTS },
  { label: "Neutral Damage", key: "neutral_damage", variants: ALL_VARIANTS },
  { label: "Boss Damage", key: "boss_damage", variants: ALL_VARIANTS },
  { label: "Damage Taken", key: "damage_taken", variants: ALL_VARIANTS },
  { label: "Player Level", key: "player_level", variants: ALL_VARIANTS },
  { label: "Creep Kills", key: "creep_kills", variants: ALL_VARIANTS },
  { label: "Neutral Kills", key: "neutral_kills", variants: ALL_VARIANTS },
  { label: "Max Health", key: "max_health", variants: ALL_VARIANTS },
  // Golden statue pickups. The player scoreboard needs a start date for them, which it always sends.
  { label: "Permanent Buffs", key: "permanent_buffs", variants: ALL_VARIANTS },
  { label: "Shots Hit", key: "shots_hit", variants: ALL_VARIANTS },
  { label: "Shots Missed", key: "shots_missed", variants: ALL_VARIANTS },
  { label: "Hero Bullets Hit", key: "hero_bullets_hit", variants: ALL_VARIANTS },
  { label: "Hero Crit Hits", key: "hero_bullets_hit_crit", variants: ALL_VARIANTS },
] as const satisfies readonly SortCategory[];

/** A stat a scoreboard sorts by. */
export type ScoreboardStat = (typeof CATEGORIES)[number]["key"];

export const SORT_CATEGORIES: readonly SortCategory[] = CATEGORIES;

/** The sorts a scoreboard offers; in Street Brawl (no soul economy) that leaves out net worth. */
export function sortCategoriesFor(scope: ScoreboardScope, gameMode?: GameMode): SortCategory[] {
  const economy = hasSoulEconomy(gameMode);
  return SORT_CATEGORIES.filter((cat) => (scope === "players" || !cat.playersOnly) && (economy || !cat.economy));
}

/**
 * The sort a scoreboard uses in a game mode: one Street Brawl does not offer (net worth) falls back, while the URL
 * keeps the choice for when the mode changes back.
 */
export function sortByIn(sortBy: string, gameMode: GameMode | undefined, fallback: string): string {
  if (hasSoulEconomy(gameMode)) return sortBy;
  const { key } = parseSortByValue(sortBy);
  return SORT_CATEGORIES.some((cat) => cat.key === key && cat.economy) ? fallback : sortBy;
}

function sortByValuesFor(scope: ScoreboardScope): string[] {
  return sortCategoriesFor(scope).flatMap((cat) =>
    cat.variants ? cat.variants.map((v) => buildSortByValue(cat.key, v)) : [cat.key],
  );
}

export const ALL_SORT_BY_VALUES: string[] = sortByValuesFor("players");
export const HERO_SORT_BY_VALUES: string[] = sortByValuesFor("heroes");

const PERCENTAGE_STATS = new Set(["winrate"]);

export function formatScoreboardValue(value: number, sortBy: string): string {
  if (PERCENTAGE_STATS.has(sortBy)) {
    return `${(value * 100).toFixed(1)}%`;
  }
  if (Number.isInteger(value)) {
    return value.toLocaleString("en-US");
  }
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** The name of a sort as a column shows it: "Avg Player Damage", "Max Kills", "Winrate". */
export function sortByLabel(sortBy: string): string {
  const { key, variant } = parseSortByValue(sortBy);
  const label = SORT_CATEGORIES.find((cat) => cat.key === key)?.label ?? key;
  return variant === "avg" ? `Avg ${label}` : variant === "max" ? `Max ${label}` : label;
}
