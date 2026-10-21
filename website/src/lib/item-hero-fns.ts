import { createServerFn } from "@tanstack/react-start";
import type { AnalyticsHeroStats } from "deadlock_api_client";

import { api } from "~/lib/api";
import type { GameMode, MatchMode } from "~/lib/game-mode";
import { expectedPairingWinRate, matchupWinRateChange } from "~/lib/matchup-stats";

const TOP_COUNT = 8;
/** Heroes with fewer purchases than this have too few games for the ranking to mean much. */
const MIN_HERO_MATCHES = 30;

export interface ItemBestHeroesRequest {
  itemId: number;
  minAverageBadge?: number;
  maxAverageBadge?: number;
  minUnixTimestamp: number;
  maxUnixTimestamp?: number;
  gameMode: GameMode;
  matchMode: MatchMode;
}

export interface ItemBestHero {
  heroId: number;
  winRate: number;
  /** What the hero's own win rate and the item's over all heroes predict together (`expectedPairingWinRate`). */
  expectedWinRate: number;
  /** The win rate after buying the item, shrunk toward `expectedWinRate`, minus it: what the list ranks by. */
  winRateChange: number;
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

/**
 * Ranks by how much better a hero does with the item than its own strength and the item's predict, as the hero matchups
 * do: a hero's win rate after buying the item is mostly the hero's own win rate, so ranking by it lists the
 * strongest heroes on nearly every item. The item's rate over all heroes is taken out too, so a late buy that comes
 * with a won game does not count for the hero.
 */
function pickTopHeroes(
  rows: readonly HeroBucketRow[],
  heroStats: readonly AnalyticsHeroStats[],
  itemId: number,
): ItemBestHero[] {
  const heroRecords = new Map(heroStats.map((row) => [row.hero_id, row]));
  const itemRows = rows.filter((row) => row.item_id === itemId);
  const item = {
    wins: itemRows.reduce((sum, row) => sum + row.wins, 0),
    matches: itemRows.reduce((sum, row) => sum + row.matches, 0),
  };
  return itemRows
    .flatMap((row) => {
      const hero = heroRecords.get(row.bucket);
      if (row.matches < MIN_HERO_MATCHES || !hero?.matches) return [];
      const expectedWinRate = expectedPairingWinRate(hero, item, "ally");
      const winRateChange = matchupWinRateChange(row.wins, row.matches, hero, item, "ally");
      if (expectedWinRate === undefined || winRateChange === undefined) return [];
      return [
        {
          heroId: row.bucket,
          winRate: row.wins / row.matches,
          expectedWinRate,
          winRateChange,
          // Purchases, not matches: an item sold and bought back counts twice, so the share is capped at all of them.
          usage: Math.min(1, row.matches / hero.matches),
          matches: row.matches,
        },
      ];
    })
    .sort((a, b) => b.winRateChange - a.winRateChange)
    .slice(0, TOP_COUNT);
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
      // No `minHeroMatches` (even 0): it routes to the exact-timestamp base table, while the item stats above come
      // from day-grained rollups, and after a mid-day patch the "bought" shares passed 100%.
      api.analytics_api.heroStats(filters),
    ]);
    return pickTopHeroes(itemStats.data, heroStats.data, itemId);
  });
