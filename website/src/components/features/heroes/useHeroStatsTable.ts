import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { AnalyticsHeroStats } from "deadlock_api_client";
import { parseAsStringLiteral, throttle, useQueryState } from "nuqs";
import { startTransition, useMemo, useState } from "react";

import type { StatTrendBucket } from "~/components/patterns/charts/StatTrendChart";
import type { Dayjs } from "~/dayjs";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { BANS_PER_MATCH, computeBanRates } from "~/lib/ban-rate";
import { getPickrateMultiplier } from "~/lib/constants";
import { useExperiment } from "~/lib/experiments";
import type { GameMode, MatchMode } from "~/lib/game-mode";
import { computeResiduals, computeZScores } from "~/lib/hero-scoring";
import { heroesQueryOptions } from "~/queries/asset-queries";
import { heroBanStatsQueryOptions } from "~/queries/hero-ban-stats-query";
import { heroStatsQueryOptions } from "~/queries/hero-stats-query";

export const HERO_TYPE_ORDER = ["assassin", "brawler", "marksman", "mystic"] as const;
export type HeroType = (typeof HERO_TYPE_ORDER)[number];

const PICK_RATE_MODES = ["pickRate", "banRate", "presence"] as const;
export type PickRateMode = (typeof PICK_RATE_MODES)[number];

// "banRate" has no column of its own any more; it stays a valid URL value so an old link still sorts by ban rate.
const SORT_KEYS = ["hero", "winrate", "zScore", "residual", "pickRate", "banRate"] as const;
export type HeroStatsSortKey = (typeof SORT_KEYS)[number];
const parseAsSortKey = parseAsStringLiteral(SORT_KEYS);
const parseAsSortDir = parseAsStringLiteral(["asc", "desc"] as const);
/** A sort or metric change lands in one throttled URL update, so one history entry. */
const together = { limitUrlUpdates: throttle(50) };

export interface HeroStatsTableFilters {
  minRankId?: number;
  maxRankId?: number;
  minHeroMatches?: number;
  minHeroMatchesTotal?: number;
  minDate?: Dayjs;
  maxDate?: Dayjs;
  prevMinDate?: Dayjs;
  prevMaxDate?: Dayjs;
  gameMode?: GameMode;
  matchMode?: MatchMode;
  /** Shows only the heroes whose name contains it. */
  nameQuery?: string;
  groupByType?: boolean;
}

/** One hero's numbers as its row shows them; deltas are against the previous interval, when there is one. */
export interface HeroStatsRowData {
  row: AnalyticsHeroStats;
  heroName: string | undefined;
  winRate: number;
  winRateDelta?: number;
  /** Share of all picks times the mode's multiplier. */
  pickRate: number;
  pickRateDelta?: number;
  /** Matches relative to the most played hero, the pick rate shown when a match minimum applies. */
  normalizedPickRate: number;
  normalizedPickRateDelta?: number;
  banRate: number;
  banRateDelta?: number;
  presence: number;
  zScore: number;
  zScoreDelta?: number;
  residual: number;
  residualDelta?: number;
}

/** A hero and its position in the sorted table (or group), counted before the name filter. */
export interface RankedHero {
  rank: number;
  hero: HeroStatsRowData;
}

function ranked(heroes: HeroStatsRowData[]): RankedHero[] {
  return heroes.map((hero, index) => ({ rank: index + 1, hero }));
}

export interface HeroTypeGroupData {
  type: HeroType;
  matches: number;
  /** Every hero of the type, sorted; `visible` are those the name filter keeps. */
  heroes: RankedHero[];
  visible: RankedHero[];
  winRate: number;
  winRateDelta?: number;
  pickShare: number;
  pickShareDelta?: number;
  banRate: number;
  banRateDelta?: number;
  presenceShare: number;
  presenceShareDelta?: number;
}

interface PrevHeroStats {
  winrate: number;
  pickrate: number;
  banrate: number;
  normalizedPickrate: number;
  zScore: number;
  residual: number;
}

function range(values: Iterable<number>): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return min === Infinity ? { min: 0, max: 0 } : { min, max };
}

function deltaOf(value: number, prev: number | undefined): number | undefined {
  return prev !== undefined ? value - prev : undefined;
}

/**
 * Everything the overall hero stats table knows: the current and previous interval's stats and bans, the scores
 * derived from them, the sort (in the URL: `hero_sort_key`, `hero_sort_dir`, `pick_rate_mode`), the name filter and
 * the grouping by hero type. The table only lays it out.
 */
export function useHeroStatsTable({
  minRankId,
  maxRankId,
  minHeroMatches,
  minHeroMatchesTotal,
  minDate,
  maxDate,
  prevMinDate,
  prevMaxDate,
  gameMode,
  matchMode,
  nameQuery,
  groupByType = false,
}: HeroStatsTableFilters) {
  const [trendBucket, setTrendBucket] = useState<StatTrendBucket>("start_time_day");
  const [sortKey, setSortKey] = useQueryState("hero_sort_key", parseAsSortKey.withDefault("winrate"));
  const [sortDir, setSortDir] = useQueryState("hero_sort_dir", parseAsSortDir.withDefault("desc"));
  const [pickRateMode, setPickRateMode] = useQueryState(
    "pick_rate_mode",
    parseAsStringLiteral(PICK_RATE_MODES).withDefault("presence"),
  );

  // Sorting re-renders every row: in a transition with a throttled (not debounced) URL update, the tap paints first.
  const onSort = (key: HeroStatsSortKey) => {
    startTransition(() => {
      if (key === sortKey) {
        void setSortDir((d) => (d === "desc" ? "asc" : "desc"), together);
      } else {
        void setSortKey(key, together);
        void setSortDir("desc", together);
      }
    });
  };

  // Picking the column's metric is asking to rank heroes by it, so the table sorts by that column right away.
  const onPickRateModeChange = (mode: PickRateMode) => {
    startTransition(() => {
      void setPickRateMode(mode, together);
      void setSortKey("pickRate", together);
      if (sortKey !== "pickRate") void setSortDir("desc", together);
    });
  };

  // A radio ignores taps on its checked option, but visitors tap it again to flip the order (PostHog dead clicks), so
  // the checked metric acts as the column's sort button.
  const onPickRateModeClick = (mode: PickRateMode) => {
    if (mode === pickRateMode) onSort("pickRate");
  };

  const { minUnixTimestamp, maxUnixTimestamp } = useNormalizedTimeRange(minDate, maxDate);
  const { minUnixTimestamp: prevMinTimestamp, maxUnixTimestamp: prevMaxTimestamp } = useNormalizedTimeRange(
    prevMinDate,
    prevMaxDate,
  );
  const hasPreviousInterval = prevMinDate != null && prevMaxDate != null;
  const supportsBans = gameMode !== "street_brawl";

  const statsParams = {
    minHeroMatches,
    minHeroMatchesTotal,
    minAverageBadge: minRankId,
    maxAverageBadge: maxRankId,
    minUnixTimestamp: minUnixTimestamp ?? 0,
    maxUnixTimestamp,
    gameMode,
    matchMode,
  };
  const prevStatsParams = {
    ...statsParams,
    minUnixTimestamp: prevMinTimestamp ?? 0,
    maxUnixTimestamp: prevMaxTimestamp,
  };
  const banParams = {
    minAverageBadge: minRankId,
    maxAverageBadge: maxRankId,
    minUnixTimestamp: minUnixTimestamp ?? 0,
    maxUnixTimestamp,
    matchMode,
  };
  const prevBanParams = { ...banParams, minUnixTimestamp: prevMinTimestamp ?? 0, maxUnixTimestamp: prevMaxTimestamp };

  const statsQuery = useQuery({
    ...heroStatsQueryOptions(statsParams),
    // A filter change keeps the old rows, dimmed, until the new ones arrive: dropping to a loading state emptied the
    // page and threw away the scroll position.
    placeholderData: keepPreviousData,
  });
  const { data: prevHeroData } = useQuery({
    ...heroStatsQueryOptions(prevStatsParams),
    enabled: hasPreviousInterval,
  });
  const { data: normalBanData } = useQuery({ ...heroBanStatsQueryOptions(banParams), enabled: supportsBans });
  const { data: normalPrevBanData } = useQuery({
    ...heroBanStatsQueryOptions(prevBanParams),
    enabled: hasPreviousInterval && supportsBans,
  });
  const heroesQuery = useQuery(heroesQueryOptions);
  const heroLinkVariant = useExperiment("exp-hero-row-link");

  const heroData = statsQuery.data;
  const heroes = heroesQuery.data;
  // Ignore cached normal-mode bans when switching to Brawl.
  const banData = supportsBans ? normalBanData : undefined;
  const prevBanData = supportsBans ? normalPrevBanData : undefined;
  const pickrateMultiplier = getPickrateMultiplier(gameMode);
  const normalized = Boolean(minHeroMatchesTotal || minHeroMatches);

  const { heroNameMap, heroTypeMap } = useMemo(() => {
    const names = new Map<number, string>();
    const types = new Map<number, HeroType>();
    for (const hero of heroes ?? []) {
      names.set(hero.id, hero.name);
      if (hero.hero_type) types.set(hero.id, hero.hero_type);
    }
    return { heroNameMap: names, heroTypeMap: types };
  }, [heroes]);

  const { banStatsMap, sumBans } = useMemo(() => {
    if (!banData || banData.length === 0) return { banStatsMap: new Map<number, number>(), sumBans: 0 };
    return { banStatsMap: computeBanRates(banData), sumBans: banData.reduce((sum, row) => sum + row.bans, 0) };
  }, [banData]);
  const hasBans = banStatsMap.size > 0;

  const prevStatsMap = useMemo(() => {
    if (!prevHeroData) return undefined;
    const prevBanStatsMap = prevBanData ? computeBanRates(prevBanData) : undefined;
    let prevSumMatches = 0;
    let prevMaxMatches = 0;
    for (const row of prevHeroData) {
      prevSumMatches += row.matches;
      if (row.matches > prevMaxMatches) prevMaxMatches = row.matches;
    }
    const inputs = prevHeroData.map((row) => ({
      winrate: row.wins / row.matches,
      pickrate: pickrateMultiplier * (row.matches / prevSumMatches),
      banrate: prevBanStatsMap?.get(row.hero_id),
      matches: row.matches,
    }));
    const zScores = computeZScores(inputs);
    const { residuals } = computeResiduals(inputs);
    const map = new Map<number, PrevHeroStats>();
    prevHeroData.forEach((row, i) => {
      map.set(row.hero_id, {
        winrate: inputs[i].winrate,
        pickrate: inputs[i].pickrate,
        banrate: prevBanStatsMap?.get(row.hero_id) ?? 0,
        normalizedPickrate: row.matches / prevMaxMatches,
        zScore: zScores[i],
        residual: residuals[i],
      });
    });
    return map;
  }, [prevHeroData, pickrateMultiplier, prevBanData]);

  /** Each hero's numbers, unsorted, and the range of each column. */
  const { heroRows, scales, sumMatches } = useMemo(() => {
    const rows = heroData ?? [];
    const sum = rows.reduce((acc, row) => acc + row.matches, 0);
    const maxMatches = range(rows.map((row) => row.matches)).max;
    const inputs = rows.map((row) => ({
      winrate: row.wins / row.matches,
      pickrate: pickrateMultiplier * (row.matches / sum),
      banrate: hasBans ? (banStatsMap.get(row.hero_id) ?? 0) : undefined,
      matches: row.matches,
    }));
    const zScores = sum ? computeZScores(inputs) : [];
    const { residuals } = sum ? computeResiduals(inputs) : { residuals: [] as number[] };
    const data = rows.map((row, i): HeroStatsRowData => {
      const prev = prevStatsMap?.get(row.hero_id);
      const winRate = row.wins / row.matches;
      const pickRate = pickrateMultiplier * (row.matches / sum);
      const normalizedPickRate = row.matches / maxMatches;
      const banRate = banStatsMap.get(row.hero_id) ?? 0;
      const zScore = zScores[i] ?? 0;
      const residual = residuals[i] ?? 0;
      return {
        row,
        heroName: heroNameMap.get(row.hero_id),
        winRate,
        winRateDelta: deltaOf(winRate, prev?.winrate),
        pickRate,
        pickRateDelta: deltaOf(pickRate, prev?.pickrate),
        normalizedPickRate,
        normalizedPickRateDelta: deltaOf(normalizedPickRate, prev?.normalizedPickrate),
        banRate,
        banRateDelta: deltaOf(banRate, prev?.banrate),
        presence: pickRate + banRate,
        zScore,
        zScoreDelta: deltaOf(zScore, prev?.zScore),
        residual,
        residualDelta: deltaOf(residual, prev?.residual),
      };
    });
    return {
      heroRows: data,
      sumMatches: sum,
      scales: {
        winRate: range(data.map((d) => d.winRate)),
        matches: range(rows.map((row) => row.matches)),
        presence: hasBans && sum ? range(data.map((d) => d.presence)) : { min: 0, max: 0 },
        banRate: range(banStatsMap.values()),
        zScore: range(zScores),
        residual: range(residuals),
      },
    };
  }, [heroData, pickrateMultiplier, hasBans, banStatsMap, prevStatsMap, heroNameMap]);

  const shownPickRateMode: PickRateMode = hasBans ? pickRateMode : "pickRate";

  const sortedRows = useMemo(() => {
    const dir = sortDir === "desc" ? 1 : -1;
    const valueOf = (d: (typeof heroRows)[number]): number => {
      switch (sortKey) {
        case "winrate":
          return d.winRate;
        case "zScore":
          return d.zScore;
        case "residual":
          return d.residual;
        case "pickRate":
          if (shownPickRateMode === "presence") return d.presence;
          if (shownPickRateMode === "banRate") return d.banRate;
          return d.row.matches;
        case "banRate":
          return d.banRate;
        default:
          return 0;
      }
    };
    return [...heroRows].sort((a, b) => {
      const diff = sortKey === "hero" ? (a.heroName ?? "").localeCompare(b.heroName ?? "") : valueOf(b) - valueOf(a);
      return diff * dir;
    });
  }, [heroRows, sortKey, sortDir, shownPickRateMode]);

  const normalizedNameQuery = nameQuery?.trim().toLowerCase() ?? "";
  const matchesName = (d: Pick<HeroStatsRowData, "heroName">) =>
    normalizedNameQuery === "" || (d.heroName ?? "").toLowerCase().includes(normalizedNameQuery);

  const visibleRows = ranked(sortedRows).filter(({ hero }) => matchesName(hero));

  const allGroups = useMemo((): Omit<HeroTypeGroupData, "visible">[] | undefined => {
    if (!groupByType || !heroData) return undefined;
    const prevByType = new Map<HeroType, { matches: number; wins: number }>();
    let prevSumMatches = 0;
    for (const row of prevHeroData ?? []) {
      prevSumMatches += row.matches;
      const type = heroTypeMap.get(row.hero_id);
      if (!type) continue;
      const existing = prevByType.get(type) ?? { matches: 0, wins: 0 };
      existing.matches += row.matches;
      existing.wins += row.wins;
      prevByType.set(type, existing);
    }
    const bansByType = new Map<HeroType, number>();
    for (const row of banData ?? []) {
      const type = heroTypeMap.get(row.hero_id);
      if (type) bansByType.set(type, (bansByType.get(type) ?? 0) + row.bans);
    }
    const prevBansByType = new Map<HeroType, number>();
    let prevSumBans = 0;
    for (const row of prevBanData ?? []) {
      prevSumBans += row.bans;
      const type = heroTypeMap.get(row.hero_id);
      if (type) prevBansByType.set(type, (prevBansByType.get(type) ?? 0) + row.bans);
    }

    return HERO_TYPE_ORDER.map((type) => {
      const heroesOfType = ranked(sortedRows.filter((d) => heroTypeMap.get(d.row.hero_id) === type));
      const totalMatches = heroesOfType.reduce((acc, { hero }) => acc + hero.row.matches, 0);
      const totalWins = heroesOfType.reduce((acc, { hero }) => acc + hero.row.wins, 0);
      const winRate = totalMatches > 0 ? totalWins / totalMatches : 0;
      const pickShare = sumMatches > 0 ? totalMatches / sumMatches : 0;

      const prev = prevByType.get(type);
      const hasPrev = prev !== undefined && prevSumMatches > 0 && prev.matches > 0;

      const typeBans = bansByType.get(type) ?? 0;
      const banTotalMatches = sumBans / BANS_PER_MATCH;
      const banRate = banTotalMatches > 0 ? typeBans / banTotalMatches : 0;
      const prevTypeBans = prevBansByType.get(type);
      const prevBanTotalMatches = prevSumBans / BANS_PER_MATCH;
      const prevBanRate =
        prevTypeBans !== undefined && prevBanTotalMatches > 0 ? prevTypeBans / prevBanTotalMatches : undefined;

      // A type's share of all picks and bans. Summing its pick share (types add up to 1) with its ban rate (bans per
      // match, types add up to 2) would weigh the two on different scales.
      const presenceShare = sumMatches + sumBans > 0 ? (totalMatches + typeBans) / (sumMatches + sumBans) : 0;
      const prevPresenceShare =
        prev && prevSumMatches > 0 && prevSumBans > 0
          ? (prev.matches + (prevTypeBans ?? 0)) / (prevSumMatches + prevSumBans)
          : undefined;

      return {
        type,
        heroes: heroesOfType,
        matches: totalMatches,
        winRate,
        winRateDelta: hasPrev ? winRate - prev.wins / prev.matches : undefined,
        pickShare,
        pickShareDelta: hasPrev ? pickShare - prev.matches / prevSumMatches : undefined,
        banRate,
        banRateDelta: deltaOf(banRate, prevBanRate),
        presenceShare,
        presenceShareDelta: deltaOf(presenceShare, prevPresenceShare),
      };
    }).filter((group) => group.matches > 0);
  }, [groupByType, heroData, prevHeroData, banData, prevBanData, heroTypeMap, sortedRows, sumMatches, sumBans]);
  const groups = allGroups?.map((group): HeroTypeGroupData =>
    Object.assign({}, group, { visible: group.heroes.filter(({ hero }) => matchesName(hero)) }),
  );

  return {
    isLoading: statsQuery.isLoading || heroesQuery.isLoading,
    isError: (statsQuery.isError && !heroData) || (heroesQuery.isError && !heroes),
    retrying: statsQuery.isFetching || heroesQuery.isFetching,
    retry: () => {
      if (statsQuery.isError) void statsQuery.refetch();
      if (heroesQuery.isError) void heroesQuery.refetch();
    },
    /** Old rows shown while a filter change loads. */
    isStale: statsQuery.isPlaceholderData,
    hasData: (heroData?.length ?? 0) > 0,
    rows: visibleRows,
    groups,
    scales,
    sumMatches,
    pickrateMultiplier,
    normalized,
    hasBans,
    pickRateMode: shownPickRateMode,
    sortKey,
    sortDir,
    onSort,
    onPickRateModeChange,
    onPickRateModeClick,
    trend: { params: statsParams, bucket: trendBucket, onBucketChange: setTrendBucket },
    heroLinkVariant,
    gameMode,
  };
}

export type HeroStatsTableState = ReturnType<typeof useHeroStatsTable>;
