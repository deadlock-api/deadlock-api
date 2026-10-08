import type { PatchEntry } from "~/lib/patches";

// The page registry: every page and tab of the site that can show an answer, with the URL parameters it reads. The AI
// search reads it to know what exists and builds its URLs from it; nothing about a page is written twice.

/** A value a URL search parameter can carry. */
export type SearchValue = string | number | boolean;

export interface Entity {
  id: number;
  name: string;
  /** A hero's internal name (`atlas` for Abrams), which the sounds page names its voice lines by. */
  codename?: string;
}

/**
 * The stats a page can be ordered or switched by, in one shared vocabulary, with what each means to the model. Each
 * page maps the keys it supports to its own parameter value; a key it does not support leaves the page's default.
 */
export const SORT_DESCRIPTIONS = {
  winrate: "win rate, winning, best",
  pickrate: "pick rate, popularity, most played",
  banrate: "ban rate, most banned",
  matches: "number of matches or games",
  wins: "number of wins",
  losses: "number of losses",
  kills: "kills",
  deaths: "deaths, dying",
  assists: "assists",
  kda: "KDA, kill death assist ratio",
  souls: "souls, net worth, farm, gold",
  damage: "damage dealt to players",
  damage_taken: "damage taken, tankiness",
  boss_damage: "damage to bosses and objectives",
  creep_damage: "damage to troopers and creeps",
  neutral_damage: "damage to neutral camps",
  healing: "healing",
  last_hits: "last hits, creep score",
  denies: "denies",
  creep_kills: "troopers or creeps killed",
  neutral_kills: "neutral camps or jungle creeps killed",
  max_health: "max health, hp",
  level: "player level",
  permanent_buffs: "golden statue buffs picked up",
  accuracy: "accuracy, aim",
  shots_hit: "shots hit",
  shots_missed: "shots missed",
  hero_hits: "bullets hit on heroes",
  crits: "crits, headshots",
  duration: "match length, game duration",
} as const;
export type SortKey = keyof typeof SORT_DESCRIPTIONS;
/** The stats a page can be ordered or switched by, in one shared vocabulary; `SORT_DESCRIPTIONS` says what each means. */
export const SORT_KEYS = Object.keys(SORT_DESCRIPTIONS) as SortKey[];

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
