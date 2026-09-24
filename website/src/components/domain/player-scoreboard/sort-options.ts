export type SortVariant = "avg" | "max" | "total";

interface SortCategory {
  label: string;
  key: string;
  variants?: SortVariant[];
  /** Only the player scoreboard can sort by it; the hero scoreboard API answers 400. */
  playersOnly?: boolean;
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

const ALL_VARIANTS: SortVariant[] = ["avg", "max", "total"];

export const SORT_CATEGORIES: SortCategory[] = [
  { label: "Matches", key: "matches" },
  { label: "Rank", key: "rank", playersOnly: true },
  { label: "Wins", key: "wins" },
  { label: "Losses", key: "losses" },
  { label: "Winrate", key: "winrate" },
  { label: "Kills", key: "kills", variants: ALL_VARIANTS },
  { label: "Deaths", key: "deaths", variants: ALL_VARIANTS },
  { label: "Assists", key: "assists", variants: ALL_VARIANTS },
  { label: "Net Worth", key: "net_worth", variants: ALL_VARIANTS },
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
  { label: "Shots Hit", key: "shots_hit", variants: ALL_VARIANTS },
  { label: "Shots Missed", key: "shots_missed", variants: ALL_VARIANTS },
  { label: "Hero Bullets Hit", key: "hero_bullets_hit", variants: ALL_VARIANTS },
  { label: "Hero Crit Hits", key: "hero_bullets_hit_crit", variants: ALL_VARIANTS },
];

export function sortCategoriesFor(scope: ScoreboardScope): SortCategory[] {
  return scope === "players" ? SORT_CATEGORIES : SORT_CATEGORIES.filter((cat) => !cat.playersOnly);
}

export function sortByValuesFor(scope: ScoreboardScope): string[] {
  return sortCategoriesFor(scope).flatMap((cat) =>
    cat.variants ? cat.variants.map((v) => buildSortByValue(cat.key, v)) : [cat.key],
  );
}

export const ALL_SORT_BY_VALUES: string[] = sortByValuesFor("players");
export const HERO_SORT_BY_VALUES: string[] = sortByValuesFor("heroes");

const PERCENTAGE_STATS = new Set(["winrate"]);

export function formatStatValue(value: number, sortBy: string): string {
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
