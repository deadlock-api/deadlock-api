import { createServerFn } from "@tanstack/react-start";
import type { AnalyticsGameStats } from "deadlock_api_client";

import { api } from "~/lib/api";
import { fetchSlimItemUpgrades, type SlimUpgrade } from "~/lib/asset-fns";
import { getPickrateMultiplier } from "~/lib/constants";
import { DEFAULT_MATCH_MODE } from "~/lib/game-mode";
import { GAME_STAT_CATEGORIES } from "~/lib/game-stat-definitions";
import { isShopableItem } from "~/lib/item-roster";
import {
  bandGap,
  compareTallies,
  dailyValues,
  daysDiffer,
  type BadgeRange,
  type EntityChange,
  type Measured,
  pooledAverage,
  significantStatChanges,
  soulsPerMinute,
  type StatChange,
  tallyBy,
  topMovers,
} from "~/lib/patch-deltas";
import { PATCH_MIN_BADGE, type PatchWindows, type UnixWindow, windowDays } from "~/lib/patches";
import { bandBadges, MAX_BADGE, RANK_BANDS } from "~/lib/rank-utils";

/** A hero needs this many matches in a window (and rank band) for its win rate to be compared. */
const MIN_HERO_MATCHES = 100;
/** Items are bought far more often than a hero is picked, but rare ones still swing on a few games. */
const MIN_ITEM_MATCHES = 100;
/** Eternus has a few hundred players: its band needs more matches before a change is more than noise. */
const MIN_TOP_BAND_MATCHES = 400;

/** How many heroes and items each list shows, at most. */
const MOVERS = 5;
/** How many game stats are listed, at most. */
const STAT_CHANGES = 8;
const DAY_S = 86_400;

/** Totals only compare per day (the window after a patch can be shorter), which the headline does. */
const COMPARABLE_STATS = GAME_STAT_CATEGORIES.flatMap((category) => category.stats).filter(
  (stat) => stat.key !== "total_matches" && stat.key !== "total_players",
);

const LOW_BAND = RANK_BANDS.findIndex((band) => band.label === "Low");
const HIGH_BAND = RANK_BANDS.findIndex((band) => band.label === "High");

const PHANTOM_UP: BadgeRange = { min: PATCH_MIN_BADGE, max: MAX_BADGE };

const BASE = { gameMode: "normal", matchMode: DEFAULT_MATCH_MODE } as const;

type ItemChange = EntityChange & { item: SlimUpgrade };

/** A headline number on both sides of the patch, and whether it moved beyond its day-to-day swing. */
export interface HeadlineStat {
  before: number | null;
  after: number | null;
  significant: boolean;
}

export interface PatchReport {
  windows: PatchWindows;
  /** Days of data in each window when the report was made; the newest patch's after window is still filling. */
  days: { before: number; after: number };
  /** Phantom+ matches on each side. */
  matches: { before: number; after: number };
  headline: {
    matchesPerDay: HeadlineStat;
    gameLength: HeadlineStat;
    soulsPerMinute: HeadlineStat;
    kills: HeadlineStat;
    firstMidBoss: HeadlineStat;
  };
  /** The heroes whose Phantom+ win rate moved most, each way, beyond the noise. */
  heroMovers: { gains: EntityChange[]; drops: EntityChange[] };
  /** Heroes with no matches before the patch. */
  newHeroes: EntityChange[];
  /**
   * The heroes the patch moved significantly differently in low and high ranks, with their change in each of
   * `RANK_BANDS`.
   */
  rankGaps: { heroId: number; deltas: (number | null)[] }[];
  /** The items whose share of Phantom+ builds moved most, each way, with the item so the page needs no item list. */
  itemMovers: { gains: ItemChange[]; drops: ItemChange[] };
  /** The game stats that moved beyond their day-to-day swing, biggest first. */
  statChanges: StatChange<keyof AnalyticsGameStats>[];
}

async function heroRows(window: UnixWindow) {
  const { data } = await api.analytics_api.heroStats({
    ...BASE,
    ...window,
    bucket: "avg_badge",
    minAverageBadge: 0,
    maxAverageBadge: MAX_BADGE,
  });
  return data;
}

async function itemRows(window: UnixWindow) {
  const { data } = await api.analytics_api.itemStats({
    ...BASE,
    ...window,
    minAverageBadge: PHANTOM_UP.min,
    maxAverageBadge: PHANTOM_UP.max,
  });
  return data;
}

/** Phantom+ game stats per day: the days' swing is what a change has to beat. */
async function gameDays(window: UnixWindow) {
  const { data } = await api.analytics_api.gameStats({
    ...BASE,
    ...window,
    bucket: "start_time_day",
    minAverageBadge: PHANTOM_UP.min,
    maxAverageBadge: PHANTOM_UP.max,
  });
  return data;
}

/**
 * Matches on each whole day inside the window: the first and last day of a window are cut by the patch (or by now),
 * and their few hours would read as a collapse in matches per day.
 */
function wholeDayMatches(rows: readonly AnalyticsGameStats[], window: UnixWindow, nowUnix: number): number[] {
  const end = Math.min(window.maxUnixTimestamp, nowUnix);
  return rows.flatMap((row) =>
    row.bucket != null && row.bucket >= window.minUnixTimestamp && row.bucket + DAY_S <= end ? [row.total_matches] : [],
  );
}

function headlineStat(
  before: readonly AnalyticsGameStats[],
  after: readonly AnalyticsGameStats[],
  read: (row: AnalyticsGameStats) => number | null | undefined,
): HeadlineStat {
  return {
    before: pooledAverage(before, read),
    after: pooledAverage(after, read),
    significant: daysDiffer(dailyValues(before, read), dailyValues(after, read)),
  };
}

/**
 * What a patch changed most, from up to 7 days before it to up to 7 days after. The raw answers are large (every hero
 * in every rank bucket, every item, twice), so the Worker reduces them and the page gets only the biggest changes.
 */
export const fetchPatchReport = createServerFn({ method: "GET" })
  .validator((windows: PatchWindows) => windows)
  .handler(async ({ data: windows }): Promise<PatchReport> => {
    const [heroBefore, heroAfter, itemBefore, itemAfter, gameBefore, gameAfter, items] = await Promise.all([
      heroRows(windows.before),
      heroRows(windows.after),
      itemRows(windows.before),
      itemRows(windows.after),
      gameDays(windows.before),
      gameDays(windows.after),
      fetchSlimItemUpgrades(),
    ]);

    const heroPickRate = getPickrateMultiplier("normal");
    const heroTallyBefore = tallyBy(heroBefore, (row) => row.hero_id, PHANTOM_UP);
    const heroTallyAfter = tallyBy(heroAfter, (row) => row.hero_id, PHANTOM_UP);
    const heroes = compareTallies(heroTallyBefore, heroTallyAfter, {
      minMatches: MIN_HERO_MATCHES,
      pickRateMultiplier: heroPickRate,
    });
    const perBand = RANK_BANDS.map((band, index) => {
      const range = bandBadges(band);
      const changes = compareTallies(
        tallyBy(heroBefore, (row) => row.hero_id, range),
        tallyBy(heroAfter, (row) => row.hero_id, range),
        {
          minMatches: index === RANK_BANDS.length - 1 ? MIN_TOP_BAND_MATCHES : MIN_HERO_MATCHES,
          pickRateMultiplier: heroPickRate,
        },
      );
      return new Map(
        changes.map((change): [number, Measured | null] => [
          change.id,
          change.winRateDelta === null || change.winRateSE === null
            ? null
            : { delta: change.winRateDelta, se: change.winRateSE },
        ]),
      );
    });
    // A new hero has nothing to compare in any band.
    const rankGaps = heroes
      .filter((hero) => !hero.isNew)
      .flatMap((hero) => {
        const bands = perBand.map((band) => band.get(hero.id) ?? null);
        const gap = bandGap(bands, LOW_BAND, HIGH_BAND);
        return gap === null ? [] : [{ heroId: hero.id, deltas: bands.map((band) => band?.delta ?? null), gap }];
      })
      .sort((a, b) => b.gap - a.gap)
      .slice(0, MOVERS)
      .map(({ heroId, deltas }) => ({ heroId, deltas }));

    const shop = new Map(items.filter(isShopableItem).map((item) => [item.id, item]));
    const itemChanges = compareTallies(
      tallyBy(itemBefore, (row) => row.item_id),
      tallyBy(itemAfter, (row) => row.item_id),
      {
        minMatches: MIN_ITEM_MATCHES,
        pickRateMultiplier: 1,
        include: (id) => shop.has(id),
        // Player-matches: the share of builds with the item, not its share of all purchases.
        base: { before: heroTallyBefore.total, after: heroTallyAfter.total },
      },
    ).flatMap((change) => {
      const item = shop.get(change.id);
      return item ? [{ ...change, item }] : [];
    });

    const now = Date.now() / 1000;
    const days = { before: windowDays(windows.before, now), after: windowDays(windows.after, now) };
    const matches = {
      before: gameBefore.reduce((sum, row) => sum + row.total_matches, 0),
      after: gameAfter.reduce((sum, row) => sum + row.total_matches, 0),
    };
    const perDayBefore = wholeDayMatches(gameBefore, windows.before, now);
    const perDayAfter = wholeDayMatches(gameAfter, windows.after, now);
    const mean = (values: number[], fallback: number) =>
      values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : fallback;
    const soulsPerMin = (row: AnalyticsGameStats) => soulsPerMinute(row.avg_net_worth, row.avg_duration_s);
    return {
      windows,
      days,
      matches,
      headline: {
        matchesPerDay: {
          before: days.before > 0 ? mean(perDayBefore, matches.before / days.before) : null,
          after: days.after > 0 ? mean(perDayAfter, matches.after / days.after) : null,
          significant: daysDiffer(perDayBefore, perDayAfter),
        },
        gameLength: headlineStat(gameBefore, gameAfter, (row) => row.avg_duration_s),
        soulsPerMinute: headlineStat(gameBefore, gameAfter, soulsPerMin),
        kills: headlineStat(gameBefore, gameAfter, (row) => row.avg_kills),
        firstMidBoss: headlineStat(gameBefore, gameAfter, (row) => row.avg_first_mid_boss_time_s),
      },
      heroMovers: topMovers(
        heroes,
        (change) => change.winRateDelta,
        (change) => change.winRateSE,
        MOVERS,
      ),
      newHeroes: heroes.filter((hero) => hero.isNew),
      rankGaps,
      itemMovers: topMovers(
        itemChanges,
        (change) => change.pickRateDelta,
        (change) => change.pickRateSE,
        MOVERS,
      ),
      statChanges: significantStatChanges(COMPARABLE_STATS, gameBefore, gameAfter, STAT_CHANGES),
    };
  });
