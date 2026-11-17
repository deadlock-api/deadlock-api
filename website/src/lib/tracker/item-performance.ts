import { shrunkWinRate } from "~/lib/shrinkage";

/** The fewest games an item or a pair needs in the selected matches to be listed. */
export const MIN_ITEM_GAMES = 3;

/**
 * How many of the player's own games at their average win rate a row's win rate is pulled towards. A player's item
 * samples are small: without it, every item bought in three won games would top the list.
 */
const PRIOR_GAMES = 10;

interface ItemRecord {
  wins: number;
  matches: number;
}

interface PerformanceRow {
  matches: number;
  wins: number;
  winrate: number;
  /** The win rate minus the player's own in the same matches. */
  delta: number;
  /** The win rate pulled towards the player's own, what the rows rank by. */
  score: number;
  /** Whether `delta` lies outside the 95% range the player's own win rate would show over as many games. */
  significant: boolean;
}

export interface TrackerItemRow extends PerformanceRow {
  itemId: number;
  /** Seconds into the match the item was bought, on average. */
  avgBuyTimeS: number;
  /** The share of the games it was sold again. */
  soldRate: number;
}

export interface TrackerItemPairRow extends PerformanceRow {
  itemIds: number[];
}

export type ItemSortKey = "matches" | "winrate";
export type ItemSortDir = "asc" | "desc";

function performance({ wins, matches }: ItemRecord, baseline: number): PerformanceRow {
  const winrate = matches > 0 ? wins / matches : 0;
  return {
    matches,
    wins,
    winrate,
    delta: winrate - baseline,
    score: shrunkWinRate(wins, matches, PRIOR_GAMES, baseline),
    significant: matches > 0 && Math.abs(winrate - baseline) > 1.96 * Math.sqrt((baseline * (1 - baseline)) / matches),
  };
}

/**
 * The player's items with at least `MIN_ITEM_GAMES` games, among those `listable` keeps (items still in the shop).
 * `baseline` is the player's win rate in the same matches.
 */
export function toItemRows(
  stats: readonly {
    item_id: number;
    wins: number;
    matches: number;
    avg_buy_time_s: number;
    sold?: number;
  }[],
  baseline: number,
  listable: (itemId: number) => boolean,
): TrackerItemRow[] {
  return stats
    .filter((row) => row.matches >= MIN_ITEM_GAMES && listable(row.item_id))
    .map((row) =>
      Object.assign(performance(row, baseline), {
        itemId: row.item_id,
        avgBuyTimeS: row.avg_buy_time_s,
        soldRate: row.matches > 0 ? (row.sold ?? 0) / row.matches : 0,
      }),
    );
}

/** The player's item pairs with at least `MIN_ITEM_GAMES` games whose items are all `listable`. */
export function toItemPairRows(
  stats: readonly { item_ids: number[]; wins: number; matches: number }[],
  baseline: number,
  listable: (itemId: number) => boolean,
): TrackerItemPairRow[] {
  return stats
    .filter((row) => row.item_ids.length > 1 && row.matches >= MIN_ITEM_GAMES && row.item_ids.every(listable))
    .map((row) => Object.assign(performance(row, baseline), { itemIds: row.item_ids }));
}

/**
 * Rows by games or by win rate. The win rate sorts by `score`, so a pair proven over thirty games outranks one that
 * won its only three; ties fall back to games, then to the ids, so the order is stable.
 */
export function sortItemRows<Row extends PerformanceRow>(
  rows: readonly Row[],
  key: ItemSortKey,
  dir: ItemSortDir,
  id: (row: Row) => string,
): Row[] {
  const sign = dir === "desc" ? -1 : 1;
  const value = (row: Row) => (key === "winrate" ? row.score : row.matches);
  return rows.toSorted(
    (a, b) =>
      sign * (value(a) - value(b)) || sign * (a.matches - b.matches) || (id(a) < id(b) ? -1 : id(a) > id(b) ? 1 : 0),
  );
}
