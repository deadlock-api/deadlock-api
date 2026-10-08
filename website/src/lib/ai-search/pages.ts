import { heroSlug } from "~/lib/hero-slug";
import { itemSlug } from "~/lib/item-slug";

import type { IntentMetric, IntentRegion } from "./intent";

// Every page the search can send a visitor to. `meaning` is what the model reads to pick one; `build` is the page's
// own part of the URL. The filters most pages share (mode, rank, time) are added by `resolveIntent`, on the pages
// that list them in `filters`.

export type SearchValue = string | number | boolean;

export interface PageTarget {
  path: string;
  search: Record<string, SearchValue>;
}

export interface Entity {
  id: number;
  name: string;
}

/** The intent with its names looked up: only names the site knows are left. */
export interface ResolvedEntities {
  heroes: Entity[];
  enemyHeroes: Entity[];
  items: Entity[];
  metric: IntentMetric;
  region: IntentRegion | null;
  /** How many heroes a team has in the chosen mode. */
  teamSize: number;
  /** The patch the question names, when it names one, for the patch notes. */
  patchId: string | undefined;
}

export type SharedFilter = "mode" | "rank" | "time";

interface PageDefinition {
  meaning: string;
  filters: readonly SharedFilter[];
  build: (entities: ResolvedEntities) => PageTarget;
}

const ALL_FILTERS = ["mode", "rank", "time"] as const;

function pick<K extends string>(map: Partial<Record<IntentMetric, K>>, metric: IntentMetric): K | undefined {
  return map[metric];
}

function only(search: Record<string, SearchValue | undefined>): Record<string, SearchValue> {
  return Object.fromEntries(Object.entries(search).filter((entry): entry is [string, SearchValue] => entry[1] != null));
}

const ids = (entities: Entity[]) => entities.map((entity) => entity.id).join(",");

/** A team as the team builder's slots: one id per slot, `0` for an empty one. */
function slots(team: Entity[], size: number): string {
  return Array.from({ length: size }, (_, i) => team[i]?.id ?? 0).join(",");
}

export const PAGES = {
  hero_stats: {
    meaning: "win rate, pick rate and ban rate of every hero; best or most played heroes",
    filters: ALL_FILTERS,
    build: ({ metric }) => ({
      path: "/analytics/heroes",
      search: only({
        hero_sort_key: pick({ winrate: "winrate", pickrate: "pickRate", banrate: "banRate" }, metric),
      }),
    }),
  },
  tier_list: {
    meaning: "hero tier list, S to D, meta heroes",
    filters: ALL_FILTERS,
    build: ({ metric }) => ({
      path: "/analytics/heroes/tier-list",
      search: only({
        tier_metric: pick(
          {
            winrate: "winRate",
            pickrate: "pickRate",
            banrate: "banRate",
            kills: "kills",
            deaths: "deaths",
            kda: "kda",
            souls: "souls",
            damage: "heroDamage",
          },
          metric,
        ),
      }),
    }),
  },
  hero_page: {
    meaning: "overview of one hero: how good it is, its stats, builds and matchups in one place",
    filters: [],
    build: ({ heroes }): PageTarget =>
      heroes[0]
        ? { path: `/analytics/heroes/${heroSlug(heroes[0].name)}`, search: {} }
        : { path: "/analytics/heroes", search: {} },
  },
  hero_counters: {
    meaning: "one hero against every other hero: its counters, who it beats, who it loses to, hero A vs hero B",
    filters: ALL_FILTERS,
    build: ({ heroes }): PageTarget =>
      heroes[0]
        ? { path: "/analytics/heroes/matchup-details", search: { hero_id: heroes[0].id } }
        : { path: "/analytics/heroes/matchups", search: {} },
  },
  hero_matchups: {
    meaning: "the matchup table of all heroes: best and worst opponents and teammates for every hero",
    filters: ALL_FILTERS,
    build: () => ({ path: "/analytics/heroes/matchups", search: {} }),
  },
  hero_synergy: {
    meaning: "hero combos and duos: which heroes win together on the same team",
    filters: ALL_FILTERS,
    build: ({ heroes }) => ({
      path: "/analytics/heroes/combos",
      search: only({ comb_include_heroes: heroes.length > 0 ? ids(heroes) : undefined }),
    }),
  },
  heroes_over_time: {
    meaning: "how heroes' win rate or pick rate changed over time, trends, nerfs and buffs",
    filters: ALL_FILTERS,
    build: ({ heroes, metric }) => ({
      path: "/analytics/heroes/over-time",
      search: only({
        trend_heroes: heroes.length > 0 ? ids(heroes) : undefined,
        hero_stat: pick(
          {
            winrate: "winrate",
            pickrate: "matches",
            banrate: "ban_rate",
            kills: "kills_per_match",
            deaths: "deaths_per_match",
            souls: "net_worth_per_match",
          },
          metric,
        ),
      }),
    }),
  },
  heroes_by_rank: {
    meaning: "hero win rates and pick rates compared across ranks, which heroes are strong at low or high rank",
    filters: ["mode", "time"],
    build: () => ({ path: "/analytics/heroes/by-rank", search: {} }),
  },
  hero_items: {
    meaning: "item win rates and best items, optionally for one hero: what to build, best items on a hero",
    filters: ALL_FILTERS,
    build: ({ heroes, items }) => ({
      path: "/analytics/items",
      search: only({ hero: heroes[0]?.id, include_items: items.length > 0 ? ids(items) : undefined }),
    }),
  },
  item_page: {
    meaning: "overview of one item: its win rate, who buys it and when",
    filters: [],
    build: ({ items }): PageTarget =>
      items[0]
        ? { path: `/analytics/items/${itemSlug(items[0].name)}`, search: {} }
        : { path: "/analytics/items", search: {} },
  },
  item_timing: {
    meaning: "when to buy an item: win rate by purchase time or souls",
    filters: ALL_FILTERS,
    build: ({ heroes, items }) => ({
      path: "/analytics/items/item-purchase-analysis",
      search: only({ item_ids: items.length > 0 ? ids(items) : undefined, hero: heroes[0]?.id }),
    }),
  },
  build_flow: {
    meaning: "build order of a hero: which items are bought first, second and later",
    filters: ALL_FILTERS,
    build: ({ heroes }) => ({ path: "/analytics/items/build-flow", search: only({ hero: heroes[0]?.id }) }),
  },
  abilities: {
    meaning: "ability and skill order of a hero: which abilities to level first",
    filters: ALL_FILTERS,
    build: ({ heroes }) => ({ path: "/analytics/abilities", search: only({ hero_id: heroes[0]?.id }) }),
  },
  team_sides: {
    meaning: "game overview: Hidden King vs Archmother (team side) win rates, match length, objectives",
    filters: ALL_FILTERS,
    build: () => ({ path: "/analytics/games", search: {} }),
  },
  games_over_time: {
    meaning: "how average game stats changed over time: match duration, kills, souls per game",
    filters: ALL_FILTERS,
    build: ({ metric }) => ({
      path: "/analytics/games/over-time",
      search: only({
        stat: pick(
          {
            kills: "avg_kills",
            deaths: "avg_deaths",
            souls: "avg_net_worth",
            damage: "avg_player_damage",
            duration: "avg_duration_s",
          },
          metric,
        ),
      }),
    }),
  },
  team_builder: {
    meaning: "draft two teams and predict which wins: my team of heroes against an enemy team",
    filters: ALL_FILTERS,
    build: ({ heroes, enemyHeroes, teamSize }) => ({
      path: "/analytics/team-builder",
      search: only({
        ally: heroes.length > 0 ? slots(heroes, teamSize) : undefined,
        enemy: enemyHeroes.length > 0 ? slots(enemyHeroes, teamSize) : undefined,
      }),
    }),
  },
  player_scoreboard: {
    meaning: "players with the most kills, wins or damage, optionally on one hero; best players of a hero",
    filters: ALL_FILTERS,
    build: ({ heroes, metric }) => ({
      path: "/analytics/players",
      search: only({
        hero: heroes[0]?.id,
        sort_by: pick(
          {
            winrate: "winrate",
            kills: "kills",
            deaths: "deaths",
            souls: "net_worth",
            damage: "player_damage",
          },
          metric,
        ),
      }),
    }),
  },
  leaderboard: {
    meaning: "ranked leaderboard of the top players by region, optionally on one hero",
    filters: [],
    build: ({ heroes, region }) => ({
      path: "/community/leaderboard",
      search: only({ region: region ?? undefined, hero_id: heroes[0]?.id }),
    }),
  },
  rank_distribution: {
    meaning: "how many players are in each rank, rank distribution, what rank am I compared to others",
    filters: ["time"],
    build: () => ({ path: "/community/badge-distribution", search: {} }),
  },
  heatmap: {
    meaning: "map heatmap of where kills and deaths happen, optionally for one hero",
    filters: ALL_FILTERS,
    build: ({ heroes }) => ({ path: "/community/heatmap", search: only({ hero_id: heroes[0]?.id }) }),
  },
  patch_notes: {
    meaning: "patch notes, what changed in a patch, the latest update",
    filters: [],
    build: ({ patchId }) => ({ path: patchId ? `/patches/${patchId}` : "/patches", search: {} }),
  },
} satisfies Record<string, PageDefinition>;

export type PageId = keyof typeof PAGES;

export const PAGE_IDS = Object.keys(PAGES) as PageId[];
