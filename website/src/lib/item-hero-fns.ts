import { createServerFn } from "@tanstack/react-start";
import type { AnalyticsHeroStats } from "deadlock_api_client";

import { api } from "~/lib/api";
import type { GameMode, MatchMode } from "~/lib/game-mode";
import { wilsonScoreInterval } from "~/lib/wilson";

const TOP_COUNT = 8;
/** Heroes with fewer purchases than this have too few games for the ranking to mean much. */
const MIN_HERO_MATCHES = 30;

export interface ItemBestHeroesRequest {
  itemId: number;
  minAverageBadge: number;
  maxAverageBadge: number;
  minUnixTimestamp: number;
  maxUnixTimestamp?: number;
  gameMode: GameMode;
  matchMode: MatchMode;
}

export interface ItemBestHero {
  heroId: number;
  winRate: number;
  /** Share of the hero's matches in which it bought the item. */
  usage: number;
  matches: number;
}

interface HeroBucketRow {
  item_id: number;
  bucket: number;
  wins: number;
  matches: number;
}

/** Ranks by the Wilson lower bound so a few lucky matches can't put a rarely picked hero on top. */
function pickTopHeroes(
  rows: readonly HeroBucketRow[],
  heroStats: readonly AnalyticsHeroStats[],
  itemId: number,
): ItemBestHero[] {
  const heroMatches = new Map(heroStats.map((row) => [row.hero_id, row.matches]));
  return rows
    .flatMap((row) => {
      const total = heroMatches.get(row.bucket);
      if (row.item_id !== itemId || row.matches < MIN_HERO_MATCHES || !total) return [];
      const [lowerBound] = wilsonScoreInterval(row.wins, row.matches);
      const hero = {
        heroId: row.bucket,
        winRate: row.wins / row.matches,
        usage: row.matches / total,
        matches: row.matches,
      };
      return [{ hero, lowerBound }];
    })
    .sort((a, b) => b.lowerBound - a.lowerBound)
    .slice(0, TOP_COUNT)
    .map(({ hero }) => hero);
}

/**
 * The per-hero item stats cover every item (~1.2 MB) and are one cached response for all item pages. The server keeps
 * them and sends one item's top heroes, so the item page renders them, and the links to each hero, in its first HTML.
 */
export const fetchItemBestHeroes = createServerFn({ method: "GET" })
  .validator((request: ItemBestHeroesRequest) => request)
  .handler(async ({ data: { itemId, ...filters } }) => {
    // The same parameters the item page's own item and hero stats use, so both responses are usually cached.
    const [itemStats, heroStats] = await Promise.all([
      api.analytics_api.itemStats({ ...filters, minMatches: 10, bucket: "hero" }),
      api.analytics_api.heroStats({ ...filters, minHeroMatches: 0, minHeroMatchesTotal: 0 }),
    ]);
    return pickTopHeroes(itemStats.data, heroStats.data, itemId);
  });
