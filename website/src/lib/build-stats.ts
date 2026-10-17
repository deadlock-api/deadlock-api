import { wilsonScoreInterval } from "~/lib/wilson";

/** One published build as the hero build stats count it: the build a player had selected when the match started. */
export interface BuildStatRow {
  hero_build_id: number;
  wins: number;
  losses: number;
  matches: number;
  players: number;
}

export interface BuildCategory {
  name: string;
  itemIds: number[];
}

/** The latest stored version of a published build. */
export interface BuildMeta {
  buildId: number;
  name: string;
  authorId: number;
  version: number;
  /** Unix seconds. */
  updatedAt: number;
  language: number;
  categories: BuildCategory[];
  /** Ability ids, one per point spent, unlocks included: the columns of a skill order grid. */
  abilityOrder: number[];
}

export interface BuildRow extends BuildStatRow {
  winRate: number;
  /** 95% Wilson interval of the win rate. */
  interval: readonly [number, number];
  /** Share of all matches played with a tracked build. */
  share: number;
  /** Win rate minus the pooled win rate of every tracked build. */
  vsAverage: number;
  /** `above` / `below` only when the whole interval is on that side of the pooled win rate. */
  verdict: "above" | "below" | "even";
  meta: BuildMeta | null | undefined;
}

export interface BuildSummary {
  builds: number;
  matches: number;
  players: number;
  winRate: number;
  /** The most played build's share of all tracked matches. */
  topShare: number;
  /** The build whose win rate is most confidently high: the largest Wilson lower bound. */
  mostReliable: BuildRow | null;
}

export function buildRows(stats: readonly BuildStatRow[], meta?: ReadonlyMap<number, BuildMeta | null>): BuildRow[] {
  const matches = stats.reduce((sum, row) => sum + row.matches, 0);
  const wins = stats.reduce((sum, row) => sum + row.wins, 0);
  const pooled = matches > 0 ? wins / matches : 0;
  return stats.map((row) => {
    const winRate = row.matches > 0 ? row.wins / row.matches : 0;
    const interval = wilsonScoreInterval(row.wins, row.matches);
    return {
      ...row,
      winRate,
      interval,
      share: matches > 0 ? row.matches / matches : 0,
      vsAverage: winRate - pooled,
      verdict: interval[0] > pooled ? "above" : interval[1] < pooled ? "below" : "even",
      meta: meta?.get(row.hero_build_id),
    };
  });
}

export function summarizeBuilds(rows: readonly BuildRow[]): BuildSummary {
  const matches = rows.reduce((sum, row) => sum + row.matches, 0);
  const wins = rows.reduce((sum, row) => sum + row.wins, 0);
  let mostReliable: BuildRow | null = null;
  let top = 0;
  for (const row of rows) {
    top = Math.max(top, row.matches);
    if (!mostReliable || row.interval[0] > mostReliable.interval[0]) mostReliable = row;
  }
  return {
    builds: rows.length,
    matches,
    // A player who switched builds is counted once per build: an upper bound, not a head count.
    players: rows.reduce((sum, row) => sum + row.players, 0),
    winRate: matches > 0 ? wins / matches : 0,
    topShare: matches > 0 ? top / matches : 0,
    mostReliable,
  };
}

export interface BuildTrend {
  /** Share of the listed builds' matches in the recent window. */
  recentShare: number;
  recentMatches: number;
  /** Recent share minus the share over the whole range: positive while a build is catching on. */
  change: number;
}

/**
 * How each listed build's share moved in a recent window of the range. Both shares are taken over the same builds,
 * the ones in `rows`, so a build outside the list does not shift them. Empty when the window has no matches.
 */
export function buildTrends(
  rows: readonly BuildRow[],
  recent: readonly Pick<BuildStatRow, "hero_build_id" | "matches">[],
): Map<number, BuildTrend> {
  const recentById = new Map(recent.map((row) => [row.hero_build_id, row.matches]));
  const total = rows.reduce((sum, row) => sum + (recentById.get(row.hero_build_id) ?? 0), 0);
  const trends = new Map<number, BuildTrend>();
  if (total === 0) return trends;
  for (const row of rows) {
    const recentMatches = recentById.get(row.hero_build_id) ?? 0;
    const recentShare = recentMatches / total;
    trends.set(row.hero_build_id, { recentShare, recentMatches, change: recentShare - row.share });
  }
  return trends;
}

export interface BuildItemPresence {
  itemId: number;
  /** How many of the builds list the item. */
  builds: number;
  /** Share of the matches (of builds with known contents) played with a build that lists the item. */
  share: number;
  /** Pooled win rate of the builds that list the item. */
  winRate: number;
  /** That win rate minus the pooled win rate of the builds that do not; null when every build lists it. */
  vsWithout: number | null;
}

/** Which items the played builds list, weighted by how often each build was played, and how those builds won. */
export function buildItemPresence(rows: readonly BuildRow[]): BuildItemPresence[] {
  const known = rows.filter((row) => row.meta);
  const totalMatches = known.reduce((sum, row) => sum + row.matches, 0);
  const totalWins = known.reduce((sum, row) => sum + row.wins, 0);
  const byItem = new Map<number, { builds: number; matches: number; wins: number }>();
  for (const row of known) {
    for (const itemId of buildItemIds(row.meta!)) {
      const acc = byItem.get(itemId) ?? { builds: 0, matches: 0, wins: 0 };
      acc.builds += 1;
      acc.matches += row.matches;
      acc.wins += row.wins;
      byItem.set(itemId, acc);
    }
  }
  return [...byItem]
    .map(([itemId, acc]) => {
      const withoutMatches = totalMatches - acc.matches;
      return {
        itemId,
        builds: acc.builds,
        share: totalMatches > 0 ? acc.matches / totalMatches : 0,
        winRate: acc.wins / acc.matches,
        vsWithout: withoutMatches > 0 ? acc.wins / acc.matches - (totalWins - acc.wins) / withoutMatches : null,
      };
    })
    .sort((a, b) => b.share - a.share || b.builds - a.builds || a.itemId - b.itemId);
}

/**
 * The items that tell the played builds apart: listed by some builds and left out of others (between `minShare` and
 * `1 - minShare` of the matches), the ones whose builds won most against the builds without them first.
 */
export function distinguishingItems(presence: readonly BuildItemPresence[], minShare = 0.1): BuildItemPresence[] {
  return presence
    .filter((item) => item.vsWithout !== null && item.share >= minShare && item.share <= 1 - minShare)
    .sort((a, b) => b.vsWithout! - a.vsWithout! || b.share - a.share || a.itemId - b.itemId);
}

/** Every item a build lists, once, in the order it first appears. */
export function buildItemIds(meta: BuildMeta): number[] {
  return [...new Set(meta.categories.flatMap((category) => category.itemIds))];
}

/** The localization keys the in-game editor names its default categories with. */
const CATEGORY_KEYS: Record<string, string> = {
  lane: "Laning",
  early: "Early Game",
  earlygame: "Early Game",
  mid: "Mid Game",
  midgame: "Mid Game",
  late: "Late Game",
  lategame: "Late Game",
  situational: "Situational",
};

/** A category's name as the game shows it: "#Citadel_HeroBuilds_EarlyGame" is "Early Game". Unnamed is null. */
export function buildCategoryName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const key = /^#Citadel_HeroBuilds_(\w+)$/.exec(trimmed)?.[1];
  if (!key) return trimmed;
  return CATEGORY_KEYS[key.toLowerCase()] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2");
}

interface CurrencyChange {
  ability_id: number;
  currency_type: number;
  delta: number;
}

/** The order of ability points a build spends: a refund (a positive delta) takes back that ability's last point. */
export function buildAbilityOrder(changes: readonly CurrencyChange[] | null | undefined, maxSteps = 16): number[] {
  const order: number[] = [];
  for (const change of changes ?? []) {
    if (change.delta < 0) order.push(change.ability_id);
    else if (change.delta > 0) {
      const last = order.lastIndexOf(change.ability_id);
      if (last !== -1) order.splice(last, 1);
    }
  }
  return order.slice(0, maxSteps);
}

const LANGUAGES: Record<number, string> = {
  0: "English",
  1: "German",
  2: "French",
  3: "Italian",
  4: "Korean",
  5: "Spanish",
  6: "Chinese",
  8: "Russian",
  9: "Thai",
  10: "Japanese",
  11: "Portuguese",
  12: "Polish",
  19: "Czech",
  21: "Turkish",
  22: "Portuguese (Brazil)",
  25: "Ukrainian",
  26: "Spanish (Latin America)",
  27: "Vietnamese",
};

export function buildLanguageName(language: number): string {
  return LANGUAGES[language] ?? "Other";
}
