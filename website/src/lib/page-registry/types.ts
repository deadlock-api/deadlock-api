import type { PatchEntry } from "~/lib/patches";

// The page registry: every page and tab of the site that can show an answer, with the URL parameters it reads. The AI
// search reads it to know what exists and builds its URLs from it; nothing about a page is written twice.

/** A value a URL search parameter can carry. */
export type SearchValue = string | number | boolean;

export interface Entity {
  id: number;
  name: string;
}

/**
 * The stats a page can be ordered or switched by, in one shared vocabulary. Each page maps the keys it supports to its
 * own parameter value; a key it does not support leaves the page's default.
 */
export const SORT_KEYS = [
  "winrate",
  "pickrate",
  "banrate",
  "matches",
  "wins",
  "losses",
  "kills",
  "deaths",
  "assists",
  "kda",
  "souls",
  "damage",
  "damage_taken",
  "boss_damage",
  "creep_damage",
  "neutral_damage",
  "healing",
  "last_hits",
  "denies",
  "creep_kills",
  "neutral_kills",
  "max_health",
  "level",
  "permanent_buffs",
  "accuracy",
  "shots_hit",
  "shots_missed",
  "hero_hits",
  "crits",
  "duration",
] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export const MODES = ["ranked", "unranked", "street_brawl"] as const;
export type SelectionMode = (typeof MODES)[number];

export const TIMES = [
  "current_patch",
  "previous_patch",
  "current_season",
  "previous_season",
  "last_7_days",
  "last_30_days",
] as const;
export type SelectionTime = (typeof TIMES)[number];

export const REGIONS = ["Europe", "Asia", "NAmerica", "SAmerica", "Oceania"] as const;
export type Region = (typeof REGIONS)[number];

/**
 * What to open a page with: the heroes, items and filters a visitor asked about, already looked up. Absent means
 * "the page's own default".
 */
export interface Selection {
  heroes: Entity[];
  /** The other team, for a page that compares two teams. */
  enemyHeroes: Entity[];
  items: Entity[];
  /** Badge range, already a valid pair. */
  rank?: { min: number; max: number };
  mode?: SelectionMode;
  time?: SelectionTime;
  region?: Region;
  sort?: SortKey;
}

/** The parts of a selection a page can use. */
export type Slot = "hero" | "heroes" | "enemyHeroes" | "item" | "items" | "region" | "sort" | "patch";

export interface SeasonRef {
  startUnix: number;
  endUnix?: number;
}

/** What the site knows when a selection becomes a URL. Lists are newest first. */
export interface ResolveContext {
  patches: readonly PatchEntry[];
  seasons: readonly SeasonRef[];
  /** Unix seconds. */
  now: number;
}

/** How one URL parameter (or path segment) is read from a selection. */
export interface ParamReader {
  uses: Slot;
  read: (selection: Selection, context: ResolveContext) => SearchValue | undefined;
}

/** The filters most pages share; a page lists the ones it reads. */
export type SharedFilter = "mode" | "rank" | "time";

export interface RegisteredPage {
  /** Stable and readable: the model answers with it. */
  id: string;
  /** For the model: what the page shows, in the words a visitor would use. */
  description: string;
  /** For the model, when the description is not enough: game terms that point here, cases it is easily mixed up with. */
  context?: string;
  /** The path, with `$name` segments filled by `pathParams`. */
  path: string;
  pathParams?: Record<string, ParamReader>;
  /** Where to go instead when a path segment has nothing to fill it with (a hero page without a hero). */
  fallbackPath?: string;
  search?: Record<string, ParamReader>;
  /** Parameters the page always opens with, whatever was asked: the tab of a page that has several. */
  fixed?: Record<string, SearchValue>;
  filters?: readonly SharedFilter[];
}

/** A page the registry deliberately leaves out of search, and why. */
export interface UnsearchablePage {
  path: string;
  reason: string;
}
