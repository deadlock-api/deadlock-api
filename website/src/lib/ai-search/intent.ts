import { PAGE_IDS, type PageId } from "./pages";

// What the on-device model answers with: not an answer to the question, but where the answer lives on the site. The
// model only ever picks from enums, which `responseConstraint` enforces, and `resolveIntent` turns the pick into a URL.

export const MODES = ["default", "ranked", "unranked", "street_brawl"] as const;
export type IntentMode = (typeof MODES)[number];

export const TIMES = [
  "default",
  "current_patch",
  "previous_patch",
  "current_season",
  "previous_season",
  "last_7_days",
  "last_30_days",
] as const;
export type IntentTime = (typeof TIMES)[number];

export const REGIONS = ["Europe", "Asia", "NAmerica", "SAmerica", "Oceania"] as const;
export type IntentRegion = (typeof REGIONS)[number];

export const METRICS = [
  "default",
  "winrate",
  "pickrate",
  "banrate",
  "kills",
  "deaths",
  "kda",
  "souls",
  "damage",
  "duration",
] as const;
export type IntentMetric = (typeof METRICS)[number];

/** The most heroes a question can name: two full teams. */
const MAX_HEROES = 6;
const MAX_ITEMS = 4;

export interface SearchIntent {
  page: PageId;
  /** The heroes the question is about; on the team builder, the player's own team. */
  heroes: string[];
  /** Only the team builder reads it: the other team. */
  enemy_heroes: string[];
  items: string[];
  /** Rank tier names ("Phantom"), each end optional. */
  rank_min: string | null;
  rank_max: string | null;
  mode: IntentMode;
  time: IntentTime;
  region: IntentRegion | null;
  metric: IntentMetric;
}

export interface IntentVocabulary {
  heroNames: readonly string[];
  itemNames: readonly string[];
  rankNames: readonly string[];
}

/** An intent with nothing narrowed: every filter at the page default. */
export const NO_FILTERS: Omit<SearchIntent, "page"> = {
  heroes: [],
  enemy_heroes: [],
  items: [],
  rank_min: null,
  rank_max: null,
  mode: "default",
  time: "default",
  region: null,
  metric: "default",
};

function nullableEnum(values: readonly string[]) {
  return { anyOf: [{ type: "string", enum: values }, { type: "null" }] };
}

/** The JSON Schema the model's answer must match, with the live hero, item and rank names as enums. */
export function buildIntentSchema({ heroNames, itemNames, rankNames }: IntentVocabulary) {
  const heroList = { type: "array", items: { type: "string", enum: heroNames }, maxItems: MAX_HEROES };
  return {
    type: "object",
    properties: {
      page: { type: "string", enum: PAGE_IDS },
      heroes: heroList,
      enemy_heroes: heroList,
      items: { type: "array", items: { type: "string", enum: itemNames }, maxItems: MAX_ITEMS },
      rank_min: nullableEnum(rankNames),
      rank_max: nullableEnum(rankNames),
      mode: { type: "string", enum: MODES },
      time: { type: "string", enum: TIMES },
      region: nullableEnum(REGIONS),
      metric: { type: "string", enum: METRICS },
    },
    required: ["page", "heroes", "enemy_heroes", "items", "rank_min", "rank_max", "mode", "time", "region", "metric"],
    additionalProperties: false,
  };
}

function oneOf<T extends string>(values: readonly T[], value: unknown, fallback: T): T {
  return values.includes(value as T) ? (value as T) : fallback;
}

function names(value: unknown, known: readonly string[], max: number): string[] {
  if (!Array.isArray(value)) return [];
  const byLower = new Map(known.map((name) => [name.toLowerCase(), name]));
  const found = value.flatMap((entry) => {
    const name = typeof entry === "string" ? byLower.get(entry.trim().toLowerCase()) : undefined;
    return name ? [name] : [];
  });
  return [...new Set(found)].slice(0, max);
}

function rankName(value: unknown, known: readonly string[]): string | null {
  return names([value], known, 1)[0] ?? null;
}

/**
 * The model's raw text as an intent, or `undefined` when it names no page. The schema already constrains the
 * output; this still drops anything off-vocabulary, so a model that ignores the constraint cannot build a broken URL.
 */
export function parseIntent(raw: string, vocabulary: IntentVocabulary): SearchIntent | undefined {
  let data: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return undefined;
    data = parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
  if (!PAGE_IDS.includes(data.page as PageId)) return undefined;
  return {
    page: data.page as PageId,
    heroes: names(data.heroes, vocabulary.heroNames, MAX_HEROES),
    enemy_heroes: names(data.enemy_heroes, vocabulary.heroNames, MAX_HEROES),
    items: names(data.items, vocabulary.itemNames, MAX_ITEMS),
    rank_min: rankName(data.rank_min, vocabulary.rankNames),
    rank_max: rankName(data.rank_max, vocabulary.rankNames),
    mode: oneOf(MODES, data.mode, "default"),
    time: oneOf(TIMES, data.time, "default"),
    region: REGIONS.includes(data.region as IntentRegion) ? (data.region as IntentRegion) : null,
    metric: oneOf(METRICS, data.metric, "default"),
  };
}

/**
 * A question that is just a hero's or an item's name goes to that page without asking the model: the answer is
 * certain and instant.
 */
export function directIntent(question: string, vocabulary: IntentVocabulary): SearchIntent | undefined {
  const [hero] = names([question], vocabulary.heroNames, 1);
  if (hero) return { ...NO_FILTERS, page: "hero_page", heroes: [hero] };
  const [item] = names([question], vocabulary.itemNames, 1);
  if (item) return { ...NO_FILTERS, page: "item_page", items: [item] };
  return undefined;
}
