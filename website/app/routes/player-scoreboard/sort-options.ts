export type SortVariant = "avg" | "max" | "total";

export interface SortCategory {
  label: string;
  /** API value key used to build the full sort_by value */
  key: string;
  /** Which variants are available. If undefined, this is a standalone stat (no variants). */
  variants?: SortVariant[];
}

/** Maps a category key + variant to the actual API sort_by value */
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

/** Parse a sort_by API value back into category key + variant */
export function parseSortByValue(sortBy: string): { key: string; variant?: SortVariant } {
  if (sortBy.startsWith("avg_") && sortBy.endsWith("_per_match")) {
    return { key: sortBy.slice(4, -10), variant: "avg" };
  }
  if (sortBy.startsWith("max_") && sortBy.endsWith("_per_match")) {
    return { key: sortBy.slice(4, -10), variant: "max" };
  }
  // Check if this key exists as a category with variants
  const cat = SORT_CATEGORIES.find((c) => c.key === sortBy && c.variants);
  if (cat) {
    return { key: sortBy, variant: "total" };
  }
  return { key: sortBy };
}

const ALL_VARIANTS: SortVariant[] = ["avg", "max", "total"];

export const SORT_CATEGORIES: SortCategory[] = [
  // General (no variants)
  { label: "Matches", key: "matches" },
  { label: "Wins", key: "wins" },
  { label: "Losses", key: "losses" },
  { label: "Winrate", key: "winrate" },
  // KDA
  { label: "Kills", key: "kills", variants: ALL_VARIANTS },
  { label: "Deaths", key: "deaths", variants: ALL_VARIANTS },
  { label: "Assists", key: "assists", variants: ALL_VARIANTS },
  // Economy
  { label: "Net Worth", key: "net_worth", variants: ALL_VARIANTS },
  { label: "Last Hits", key: "last_hits", variants: ALL_VARIANTS },
  { label: "Denies", key: "denies", variants: ALL_VARIANTS },
  // Damage
  { label: "Player Damage", key: "player_damage", variants: ALL_VARIANTS },
  { label: "Creep Damage", key: "creep_damage", variants: ALL_VARIANTS },
  { label: "Neutral Damage", key: "neutral_damage", variants: ALL_VARIANTS },
  { label: "Boss Damage", key: "boss_damage", variants: ALL_VARIANTS },
  { label: "Damage Taken", key: "damage_taken", variants: ALL_VARIANTS },
  // Other
  { label: "Player Level", key: "player_level", variants: ALL_VARIANTS },
  { label: "Creep Kills", key: "creep_kills", variants: ALL_VARIANTS },
  { label: "Neutral Kills", key: "neutral_kills", variants: ALL_VARIANTS },
  { label: "Max Health", key: "max_health", variants: ALL_VARIANTS },
  { label: "Shots Hit", key: "shots_hit", variants: ALL_VARIANTS },
  { label: "Shots Missed", key: "shots_missed", variants: ALL_VARIANTS },
  { label: "Hero Bullets Hit", key: "hero_bullets_hit", variants: ALL_VARIANTS },
  { label: "Hero Crit Hits", key: "hero_bullets_hit_crit", variants: ALL_VARIANTS },
];

/** All valid sort_by API values (for nuqs parser) */
export const ALL_SORT_BY_VALUES: string[] = SORT_CATEGORIES.flatMap((cat) =>
  cat.variants ? cat.variants.map((v) => buildSortByValue(cat.key, v)) : [cat.key],
);

const PERCENTAGE_STATS = new Set(["winrate"]);

export function formatStatValue(value: number, sortBy: string): string {
  if (PERCENTAGE_STATS.has(sortBy)) {
    return `${(value * 100).toFixed(1)}%`;
  }
  if (Number.isInteger(value)) {
    return value.toLocaleString();
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

const VARIANT_LABELS: Record<SortVariant, string> = { avg: "Avg", max: "Max", total: "Total" };

export function getSortByLabel(sortBy: string): string {
  const { key, variant } = parseSortByValue(sortBy);
  const cat = SORT_CATEGORIES.find((c) => c.key === key);
  if (!cat) return sortBy;
  if (!variant) return cat.label;
  return `${VARIANT_LABELS[variant]} ${cat.label}`;
}
