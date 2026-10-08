import { day } from "~/dayjs";
import { MODE_CONFIG, type Mode } from "~/lib/game-mode";
import { parseAsDayjsRange } from "~/lib/nuqs-parsers";
import { type PatchEntry, patchDateRange } from "~/lib/patches";
import { MAX_BADGE } from "~/lib/rank-utils";

import type { IntentMode, IntentTime, SearchIntent } from "./intent";
import { type Entity, PAGES, type PageTarget, type SearchValue } from "./pages";

export interface RankTier {
  tier: number;
  name: string;
}

export interface SeasonWindow {
  startUnix: number;
  endUnix?: number;
}

/** What the site knows that the intent's names and words are looked up in. Lists are newest first. */
export interface ResolveContext {
  heroes: readonly Entity[];
  items: readonly Entity[];
  ranks: readonly RankTier[];
  patches: readonly PatchEntry[];
  seasons: readonly SeasonWindow[];
  /** Unix seconds, for "last 7 days". */
  now: number;
}

const MODE_BY_INTENT: Record<Exclude<IntentMode, "default">, Mode> = {
  ranked: "normal_ranked",
  unranked: "normal_unranked",
  street_brawl: "street_brawl",
};

/** Heroes per team: Street Brawl is 4v4. */
const TEAM_SIZE = { normal: 6, street_brawl: 4 } as const;

function lookUp(names: readonly string[], entities: readonly Entity[]): Entity[] {
  return names.flatMap((name) => entities.find((entity) => entity.name === name) ?? []);
}

function rangeSince(startUnix: number, endUnix?: number): string {
  return parseAsDayjsRange.serialize([day.unix(startUnix), endUnix === undefined ? undefined : day.unix(endUnix)]);
}

function lastDays(now: number, days: number): string {
  return parseAsDayjsRange.serialize([day.unix(now).utc().startOf("day").subtract(days, "day"), undefined]);
}

/** The `date_range` a time word stands for, or `undefined` to keep the page's own default. */
function dateRange(time: IntentTime, context: ResolveContext): string | undefined {
  const [patch, previousPatch] = context.patches;
  const [season, previousSeason] = context.seasons;
  switch (time) {
    case "current_patch":
      return patch && patchDateRange(patch);
    case "previous_patch":
      return previousPatch && patchDateRange(previousPatch);
    case "current_season":
      return season && rangeSince(season.startUnix, season.endUnix);
    case "previous_season":
      return previousSeason && rangeSince(previousSeason.startUnix, previousSeason.endUnix);
    case "last_7_days":
      return lastDays(context.now, 7);
    case "last_30_days":
      return lastDays(context.now, 30);
    case "default":
      return undefined;
  }
}

function tierOf(name: string | null, ranks: readonly RankTier[]): number | undefined {
  return name === null ? undefined : ranks.find((rank) => rank.name === name)?.tier;
}

/**
 * The badge range of the named tiers, from the first subrank of the lower to the last of the upper. A one-sided
 * question ("Phantom and up") opens the other end, so a page whose default floor is Phantom does not keep it.
 */
function rankRange(intent: SearchIntent, ranks: readonly RankTier[]): { min_rank: number; max_rank: number } | null {
  let min = tierOf(intent.rank_min, ranks);
  let max = tierOf(intent.rank_max, ranks);
  if (min === undefined && max === undefined) return null;
  if (min !== undefined && max !== undefined && min > max) [min, max] = [max, min];
  return {
    min_rank: min === undefined || min === 0 ? 0 : min * 10 + 1,
    max_rank: max === undefined ? MAX_BADGE : max === 0 ? 0 : max * 10 + 6,
  };
}

/** Where the intent leads: the page's own path and params, plus the shared filters that page reads. */
export function resolveIntent(intent: SearchIntent, context: ResolveContext): PageTarget {
  const page = PAGES[intent.page];
  const mode = intent.mode === "default" ? undefined : MODE_BY_INTENT[intent.mode];
  const config = MODE_CONFIG[mode ?? "normal_all"];
  const patchId = intent.time === "previous_patch" ? context.patches[1]?.id : undefined;

  const target = page.build({
    heroes: lookUp(intent.heroes, context.heroes),
    enemyHeroes: lookUp(intent.enemy_heroes, context.heroes),
    items: lookUp(intent.items, context.items),
    metric: intent.metric,
    region: intent.region,
    teamSize: TEAM_SIZE[config.gameMode],
    patchId,
  });

  const filters: readonly string[] = page.filters;
  const search: Record<string, SearchValue> = { ...target.search };
  if (filters.includes("mode") && mode) {
    search.game_mode = config.gameMode;
    search.match_mode = config.matchMode;
  }
  if (filters.includes("rank") && config.supportsRank) {
    Object.assign(search, rankRange(intent, context.ranks));
  }
  if (filters.includes("time")) {
    const range = dateRange(intent.time, context);
    if (range) search.date_range = range;
  }
  return { path: target.path, search };
}
