import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { AnalyticsHeroStats } from "deadlock_api_client";
import type { AnalyticsApiHeroBanStatsRequest } from "deadlock_api_client";
import { Crosshair, Info, Skull, Sparkles, Swords, type LucideIcon } from "lucide-react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useMemo, useState } from "react";

import { HeroCell } from "~/components/domain/assets/HeroCell";
import { HeroImage } from "~/components/domain/assets/HeroImage";
import { HeroDetailsTooltip } from "~/components/features/heroes/HeroDetailsTooltip";
import { HeroStatTrend } from "~/components/features/heroes/HeroStatTrend";
import type { StatTrendBucket } from "~/components/patterns/charts/StatTrendChart";
import { SortableHeader } from "~/components/patterns/data-table/SortableHeader";
import { Panel, PanelHeader } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Button } from "~/components/ui/button";
import { Delta } from "~/components/ui/delta";
import { ProgressBarSegment } from "~/components/ui/progress-bar";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { SortButton, ariaSort } from "~/components/ui/sort-button";
import { Inline, Stack } from "~/components/ui/stack";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { TextLink } from "~/components/ui/text-link";
import { Tooltip } from "~/components/ui/tooltip";
import { CACHE_DURATIONS } from "~/constants/cache";
import type { Dayjs } from "~/dayjs";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { api } from "~/lib/api";
import { BANS_PER_MATCH, computeBanRates } from "~/lib/ban-rate";
import { getPickrateMultiplier } from "~/lib/constants";
import { useExperiment } from "~/lib/experiments";
import { formatPercent } from "~/lib/format";
import type { GameMode, MatchMode } from "~/lib/game-mode";
import {
  Z_SCORE_BR_WEIGHT,
  Z_SCORE_PR_WEIGHT,
  Z_SCORE_WR_WEIGHT,
  computeResiduals,
  computeZScores,
} from "~/lib/hero-scoring";
import { heroSlug } from "~/lib/hero-slug";
import { heroesQueryOptions } from "~/queries/asset-queries";
import { queryKeys } from "~/queries/query-keys";

const HERO_TYPE_CONFIG: Record<string, { label: string; color: string; icon: LucideIcon }> = {
  assassin: { label: "Assassin", color: "var(--chart-6)", icon: Skull },
  brawler: { label: "Brawler", color: "var(--chart-1)", icon: Swords },
  marksman: { label: "Marksman", color: "var(--chart-2)", icon: Crosshair },
  mystic: { label: "Mystic", color: "var(--chart-4)", icon: Sparkles },
} as const;

type HeroType = keyof typeof HERO_TYPE_CONFIG;

const HERO_TYPE_ORDER: HeroType[] = ["assassin", "brawler", "marksman", "mystic"];

const PICK_RATE_MODES = ["pickRate", "banRate", "presence"] as const;
type PickRateMode = (typeof PICK_RATE_MODES)[number];

const SORT_KEYS = ["hero", "winrate", "zScore", "residual", "pickRate", "banRate"] as const;
type SortKey = (typeof SORT_KEYS)[number];
const parseAsSortKey = parseAsStringLiteral(SORT_KEYS);
const parseAsSortDir = parseAsStringLiteral(["asc", "desc"] as const);

function GroupStat({
  label,
  value,
  delta,
  invert,
}: {
  label: string;
  value: number;
  delta?: number;
  invert?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{(value * 100).toFixed(1)}%</span>
      {delta !== undefined && <Delta value={delta} invert={invert} className="text-xs" />}
    </div>
  );
}

export function HeroStatsTable({
  columns,
  limit,
  hideHeader,
  hideIndex,
  groupByType,
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
  onClearNameQuery,
  showMatchCounts,
}: {
  columns: string[];
  limit?: number;
  hideHeader?: boolean;
  hideIndex?: boolean;
  groupByType?: boolean;
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
  nameQuery?: string;
  onClearNameQuery?: () => void;
  showMatchCounts?: boolean;
}) {
  const [trendBucket, setTrendBucket] = useState<StatTrendBucket>("start_time_day");
  const [activeSortKey, setActiveSortKey] = useQueryState("hero_sort_key", parseAsSortKey.withDefault("winrate"));
  const [sortDir, setSortDir] = useQueryState("hero_sort_dir", parseAsSortDir.withDefault("desc"));
  const [pickRateMode, setPickRateMode] = useQueryState(
    "pick_rate_mode",
    parseAsStringLiteral(PICK_RATE_MODES).withDefault("presence"),
  );

  const handleSort = (key: SortKey) => {
    if (key === activeSortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setActiveSortKey(key);
      setSortDir("desc");
    }
  };

  // Picking the column's metric is asking to rank heroes by it, so the table sorts by that column right away.
  const handlePickRateModeChange = (mode: PickRateMode) => {
    setPickRateMode(mode);
    setActiveSortKey("pickRate");
    if (activeSortKey !== "pickRate") setSortDir("desc");
  };

  const { minUnixTimestamp, maxUnixTimestamp } = useNormalizedTimeRange(minDate, maxDate);
  const { minUnixTimestamp: prevMinTimestamp, maxUnixTimestamp: prevMaxTimestamp } = useNormalizedTimeRange(
    prevMinDate,
    prevMaxDate,
  );

  const heroStatsQuery = {
    minHeroMatches: minHeroMatches,
    minHeroMatchesTotal: minHeroMatchesTotal,
    minAverageBadge: minRankId,
    maxAverageBadge: maxRankId,
    minUnixTimestamp: minUnixTimestamp ?? 0,
    maxUnixTimestamp,
    gameMode: gameMode,
    matchMode,
  };
  const {
    data: heroData,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: queryKeys.analytics.heroStats(heroStatsQuery),
    queryFn: async () => {
      const response = await api.analytics_api.heroStats(heroStatsQuery);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_DAY,
  });

  const hasPreviousInterval = prevMinDate != null && prevMaxDate != null;

  const prevHeroStatsQuery = {
    minHeroMatches: minHeroMatches,
    minHeroMatchesTotal: minHeroMatchesTotal,
    minAverageBadge: minRankId,
    maxAverageBadge: maxRankId,
    minUnixTimestamp: prevMinTimestamp ?? 0,
    maxUnixTimestamp: prevMaxTimestamp,
    gameMode: gameMode,
    matchMode,
  };
  const { data: prevHeroData } = useQuery({
    queryKey: queryKeys.analytics.heroStats(prevHeroStatsQuery),
    queryFn: async () => {
      const response = await api.analytics_api.heroStats(prevHeroStatsQuery);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_DAY,
    enabled: hasPreviousInterval,
  });

  const banStatsQuery: AnalyticsApiHeroBanStatsRequest = {
    minAverageBadge: minRankId,
    maxAverageBadge: maxRankId,
    minUnixTimestamp: minUnixTimestamp ?? 0,
    maxUnixTimestamp,
    matchMode,
  };
  const supportsBans = gameMode !== "street_brawl";
  const { data: normalBanData } = useQuery({
    queryKey: queryKeys.analytics.heroBanStats(banStatsQuery),
    queryFn: async () => {
      const response = await api.analytics_api.heroBanStats(banStatsQuery);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_DAY,
    enabled: supportsBans,
  });

  const prevBanStatsQuery: AnalyticsApiHeroBanStatsRequest = {
    minAverageBadge: minRankId,
    maxAverageBadge: maxRankId,
    minUnixTimestamp: prevMinTimestamp ?? 0,
    maxUnixTimestamp: prevMaxTimestamp,
    matchMode,
  };
  const { data: normalPrevBanData } = useQuery({
    queryKey: queryKeys.analytics.heroBanStats(prevBanStatsQuery),
    queryFn: async () => {
      const response = await api.analytics_api.heroBanStats(prevBanStatsQuery);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_DAY,
    enabled: hasPreviousInterval && supportsBans,
  });

  // Ignore cached normal-mode bans when switching to Brawl.
  const banData = supportsBans ? normalBanData : undefined;
  const prevBanData = supportsBans ? normalPrevBanData : undefined;

  const pickrateMultiplier = getPickrateMultiplier(gameMode);

  const {
    data: heroes,
    isLoading: isLoadingHeroes,
    isError: isHeroesError,
    refetch: refetchHeroes,
    isFetching: isFetchingHeroes,
  } = useQuery(heroesQueryOptions);
  const heroRowLinkVariant = useExperiment("exp-hero-row-link");
  const heroNameMap = useMemo(() => {
    if (!heroes) return new Map<number, string>();
    const map = new Map<number, string>();
    for (const hero of heroes) {
      map.set(hero.id, hero.name);
    }
    return map;
  }, [heroes]);

  const heroTypeMap = useMemo(() => {
    if (!heroes) return new Map<number, HeroType>();
    const map = new Map<number, HeroType>();
    for (const hero of heroes) {
      if (hero.hero_type) {
        map.set(hero.id, hero.hero_type as HeroType);
      }
    }
    return map;
  }, [heroes]);

  const { banStatsMap, sumBans } = useMemo(() => {
    if (!banData || banData.length === 0)
      return {
        banStatsMap: new Map<number, number>(),
        sumBans: 0,
      };
    const rateMap = computeBanRates(banData);
    let sumB = 0;
    for (const row of banData) {
      sumB += row.bans;
    }
    return { banStatsMap: rateMap, sumBans: sumB };
  }, [banData]);

  const prevBanStatsMap = useMemo(() => {
    if (!prevBanData) return undefined;
    return computeBanRates(prevBanData);
  }, [prevBanData]);

  const prevStatsMap = useMemo(() => {
    if (!prevHeroData) return undefined;
    let prevSumMatches = 0;
    let prevMaxMatches = 0;
    for (const row of prevHeroData) {
      prevSumMatches += row.matches;
      if (row.matches > prevMaxMatches) prevMaxMatches = row.matches;
    }
    const heroInputs = prevHeroData.map((row) => ({
      winrate: row.wins / row.matches,
      pickrate: pickrateMultiplier * (row.matches / prevSumMatches),
      banrate: prevBanStatsMap?.get(row.hero_id),
      matches: row.matches,
    }));
    const prevZScores = computeZScores(heroInputs);
    const { residuals: prevResiduals } = computeResiduals(heroInputs);
    const map = new Map<
      number,
      {
        winrate: number;
        pickrate: number;
        banrate: number;
        presence: number;
        normalizedPickrate: number;
        zScore: number;
        residual: number;
      }
    >();
    for (let i = 0; i < prevHeroData.length; i++) {
      const banrate = prevBanStatsMap?.get(prevHeroData[i].hero_id) ?? 0;
      map.set(prevHeroData[i].hero_id, {
        winrate: heroInputs[i].winrate,
        pickrate: heroInputs[i].pickrate,
        banrate,
        presence: heroInputs[i].pickrate + banrate,
        normalizedPickrate: prevHeroData[i].matches / prevMaxMatches,
        zScore: prevZScores[i],
        residual: prevResiduals[i],
      });
    }
    return map;
  }, [prevHeroData, pickrateMultiplier, prevBanStatsMap]);

  const { minWinrate, maxWinrate, minMatches, maxMatches, sumMatches } = useMemo(() => {
    if (!heroData || heroData.length === 0)
      return { minWinrate: 0, maxWinrate: 0, minMatches: 0, maxMatches: 0, sumMatches: 0 };
    let minWr = Infinity;
    let maxWr = -Infinity;
    let minM = Infinity;
    let maxM = -Infinity;
    let sumM = 0;
    for (const item of heroData) {
      const wr = item.wins / item.matches;
      if (wr < minWr) minWr = wr;
      if (wr > maxWr) maxWr = wr;
      if (item.matches < minM) minM = item.matches;
      if (item.matches > maxM) maxM = item.matches;
      sumM += item.matches;
    }
    return { minWinrate: minWr, maxWinrate: maxWr, minMatches: minM, maxMatches: maxM, sumMatches: sumM };
  }, [heroData]);
  const { zScoreMap, residualMap, minZScore, maxZScore, minResidual, maxResidual } = useMemo(() => {
    if (!heroData || !sumMatches)
      return {
        zScoreMap: new Map<number, number>(),
        residualMap: new Map<number, { residual: number; expected: number }>(),
        minZScore: 0,
        maxZScore: 0,
        minResidual: 0,
        maxResidual: 0,
      };
    const inputs = heroData.map((row) => ({
      winrate: row.wins / row.matches,
      pickrate: pickrateMultiplier * (row.matches / sumMatches),
      banrate: banStatsMap.size > 0 ? (banStatsMap.get(row.hero_id) ?? 0) : undefined,
      matches: row.matches,
    }));
    const scores = computeZScores(inputs);
    const { residuals, expectedWinrates } = computeResiduals(inputs);
    const zMap = new Map<number, number>();
    const rMap = new Map<number, { residual: number; expected: number }>();
    for (let i = 0; i < heroData.length; i++) {
      zMap.set(heroData[i].hero_id, scores[i]);
      rMap.set(heroData[i].hero_id, {
        residual: residuals[i],
        expected: expectedWinrates[i],
      });
    }
    return {
      zScoreMap: zMap,
      residualMap: rMap,
      minZScore: Math.min(...scores),
      maxZScore: Math.max(...scores),
      minResidual: Math.min(...residuals),
      maxResidual: Math.max(...residuals),
    };
  }, [heroData, sumMatches, pickrateMultiplier, banStatsMap]);

  const { presenceMap, minPresence, maxPresence } = useMemo(() => {
    if (!heroData || !sumMatches || banStatsMap.size === 0)
      return {
        presenceMap: new Map<number, number>(),
        minPresence: 0,
        maxPresence: 0,
      };
    const map = new Map<number, number>();
    let minP = Infinity;
    let maxP = -Infinity;
    for (const row of heroData) {
      const pickRate = pickrateMultiplier * (row.matches / sumMatches);
      const banRate = banStatsMap.get(row.hero_id) ?? 0;
      const presence = pickRate + banRate;
      map.set(row.hero_id, presence);
      if (presence < minP) minP = presence;
      if (presence > maxP) maxP = presence;
    }
    return { presenceMap: map, minPresence: minP, maxPresence: maxP };
  }, [heroData, sumMatches, pickrateMultiplier, banStatsMap]);

  const { minBanRate, maxBanRate } = useMemo(() => {
    if (banStatsMap.size === 0) return { minBanRate: 0, maxBanRate: 0 };
    let minB = Infinity;
    let maxB = -Infinity;
    for (const rate of banStatsMap.values()) {
      if (rate < minB) minB = rate;
      if (rate > maxB) maxB = rate;
    }
    return { minBanRate: minB, maxBanRate: maxB };
  }, [banStatsMap]);

  const showPresence = pickRateMode === "presence" && banStatsMap.size > 0;
  const showBanRate = pickRateMode === "banRate" && banStatsMap.size > 0;
  const sortedData = useMemo(() => {
    if (!heroData) return heroData;
    const dir = sortDir === "desc" ? 1 : -1;
    return [...heroData].sort((a, b) => {
      let diff = 0;
      switch (activeSortKey) {
        case "hero": {
          const nameA = heroNameMap.get(a.hero_id) ?? "";
          const nameB = heroNameMap.get(b.hero_id) ?? "";
          diff = nameA.localeCompare(nameB);
          break;
        }
        case "winrate":
          diff = b.wins / b.matches - a.wins / a.matches;
          break;
        case "zScore":
          diff = (zScoreMap.get(b.hero_id) ?? 0) - (zScoreMap.get(a.hero_id) ?? 0);
          break;
        case "residual":
          diff = (residualMap.get(b.hero_id)?.residual ?? 0) - (residualMap.get(a.hero_id)?.residual ?? 0);
          break;
        case "pickRate":
          if (showPresence) {
            diff = (presenceMap.get(b.hero_id) ?? 0) - (presenceMap.get(a.hero_id) ?? 0);
          } else if (showBanRate) {
            diff = (banStatsMap.get(b.hero_id) ?? 0) - (banStatsMap.get(a.hero_id) ?? 0);
          } else {
            diff = b.matches - a.matches;
          }
          break;
        case "banRate":
          diff = (banStatsMap.get(b.hero_id) ?? 0) - (banStatsMap.get(a.hero_id) ?? 0);
          break;
      }
      return diff * dir;
    });
  }, [
    heroData,
    activeSortKey,
    sortDir,
    heroNameMap,
    zScoreMap,
    residualMap,
    banStatsMap,
    presenceMap,
    showPresence,
    showBanRate,
  ]);
  const limitedData = useMemo(() => (limit ? sortedData?.slice(0, limit) : sortedData), [sortedData, limit]);
  const normalizedNameQuery = nameQuery?.trim().toLowerCase() ?? "";
  const matchesNameQuery = (heroId: number) =>
    normalizedNameQuery === "" || (heroNameMap.get(heroId) ?? "").toLowerCase().includes(normalizedNameQuery);

  const groupedData = useMemo(() => {
    if (!groupByType || !sortedData) return undefined;
    const grouped = new Map<HeroType, AnalyticsHeroStats[]>();
    for (const type of HERO_TYPE_ORDER) {
      grouped.set(type, []);
    }
    for (const row of sortedData) {
      const type = heroTypeMap.get(row.hero_id);
      if (type && grouped.has(type)) {
        grouped.get(type)!.push(row);
      }
    }
    return grouped;
  }, [groupByType, sortedData, heroTypeMap]);

  const groupStats = useMemo(() => {
    if (!groupByType || !groupedData || !heroData) return undefined;

    // Group previous data by type in one pass instead of filtering per type
    let prevSumMatches = 0;
    const prevByType = new Map<HeroType, { matches: number; wins: number }>();
    if (prevHeroData) {
      for (const row of prevHeroData) {
        prevSumMatches += row.matches;
        const type = heroTypeMap.get(row.hero_id);
        if (type) {
          const existing = prevByType.get(type);
          if (existing) {
            existing.matches += row.matches;
            existing.wins += row.wins;
          } else {
            prevByType.set(type, { matches: row.matches, wins: row.wins });
          }
        }
      }
    }

    // Aggregate bans by type
    const bansByType = new Map<HeroType, number>();
    if (banData) {
      for (const row of banData) {
        const type = heroTypeMap.get(row.hero_id);
        if (type) {
          bansByType.set(type, (bansByType.get(type) ?? 0) + row.bans);
        }
      }
    }
    const prevBansByType = new Map<HeroType, number>();
    let prevSumBans = 0;
    if (prevBanData) {
      for (const row of prevBanData) {
        prevSumBans += row.bans;
        const type = heroTypeMap.get(row.hero_id);
        if (type) {
          prevBansByType.set(type, (prevBansByType.get(type) ?? 0) + row.bans);
        }
      }
    }

    return HERO_TYPE_ORDER.map((type) => {
      const heroesInGroup = groupedData.get(type) ?? [];
      const totalMatches = heroesInGroup.reduce((acc, row) => acc + row.matches, 0);
      const totalWins = heroesInGroup.reduce((acc, row) => acc + row.wins, 0);

      let prevWinrate: number | undefined;
      let prevPickrate: number | undefined;
      const prev = prevByType.get(type);
      if (prev && prevSumMatches > 0 && prev.matches > 0) {
        prevWinrate = prev.wins / prev.matches;
        prevPickrate = prev.matches / prevSumMatches;
      }

      const typeBans = bansByType.get(type) ?? 0;
      const banTotalMatches = sumBans / BANS_PER_MATCH;
      const banRate = banTotalMatches > 0 ? typeBans / banTotalMatches : 0;
      const prevTypeBans = prevBansByType.get(type);
      const prevBanTotalMatches = prevSumBans / BANS_PER_MATCH;
      const prevBanRate =
        prevTypeBans !== undefined && prevBanTotalMatches > 0 ? prevTypeBans / prevBanTotalMatches : undefined;

      return {
        type,
        winrate: totalMatches > 0 ? totalWins / totalMatches : 0,
        pickrate: sumMatches > 0 ? totalMatches / sumMatches : 0,
        totalMatches,
        prevWinrate,
        prevPickrate,
        banRate,
        prevBanRate,
      };
    }).filter((g) => g.totalMatches > 0);
  }, [groupByType, groupedData, heroData, prevHeroData, heroTypeMap, sumMatches, banData, prevBanData, sumBans]);

  if (isLoading || isLoadingHeroes) {
    return <LoadingState label="hero stats" align="center" />;
  }

  if ((isError && !heroData) || (isHeroesError && !heroes)) {
    return (
      <ErrorState
        title="Unable to load hero stats"
        description="Your filters are still selected. Try loading the data again."
        retrying={isFetching || isFetchingHeroes}
        onRetry={() => {
          if (isError) void refetch();
          if (isHeroesError) void refetchHeroes();
        }}
      />
    );
  }

  const visibleCount = limitedData?.filter((row) => matchesNameQuery(row.hero_id)).length ?? 0;
  if (visibleCount === 0) {
    const hasData = (heroData?.length ?? 0) > 0;
    return (
      <EmptyState
        title={hasData ? "No heroes match your search" : "No hero stats for these filters"}
        description={
          hasData
            ? "Try another hero name or clear your search."
            : "Try a wider date range, more ranks, or lower match requirements."
        }
        action={
          hasData &&
          onClearNameQuery && (
            <Button variant="outline" onClick={onClearNameQuery}>
              Clear search
            </Button>
          )
        }
      />
    );
  }

  const renderTableHeader = (showIndex: boolean) => (
    <TableHeader tone="muted">
      <TableRow>
        {showIndex && <TableHead className="w-1/100 text-center">#</TableHead>}
        <TableHead
          // "desc" is the default direction of every column; for names it means A to Z.
          aria-sort={ariaSort(activeSortKey === "hero", sortDir === "desc" ? "asc" : "desc")}
          className="w-1/100 min-w-40"
          data-pinned
        >
          <SortButton
            active={activeSortKey === "hero"}
            sortDir={sortDir}
            align="start"
            onClick={() => handleSort("hero")}
          >
            <span>Hero</span>
          </SortButton>
        </TableHead>
        {columns.includes("winRate") && (
          <SortableHeader
            label="Win Rate"
            sortKey="winrate"
            activeSortKey={activeSortKey}
            sortDir={sortDir}
            onSortChange={handleSort}
            className="w-19/100 text-center"
          />
        )}
        {columns.includes("pickRate") && (
          <TableHead aria-sort={ariaSort(activeSortKey === "pickRate", sortDir)} className="w-19/100 text-center">
            <Inline justify="center" wrap="nowrap" className="inline-flex">
              {banStatsMap.size > 0 ? (
                <Segmented
                  size="sm"
                  width="hug"
                  aria-label="Pick rate column metric"
                  value={showPresence ? "presence" : showBanRate ? "banRate" : "pickRate"}
                  onValueChange={handlePickRateModeChange}
                >
                  <SegmentedItem value="pickRate">
                    {minHeroMatchesTotal || minHeroMatches ? "Pick Rate (Norm.)" : "Pick Rate"}
                  </SegmentedItem>
                  <SegmentedItem value="banRate">Ban Rate</SegmentedItem>
                  <SegmentedItem value="presence">Presence</SegmentedItem>
                </Segmented>
              ) : (
                <span>{minHeroMatchesTotal || minHeroMatches ? "Pick Rate (Normalized)" : "Pick Rate"}</span>
              )}
              <SortButton
                active={activeSortKey === "pickRate"}
                sortDir={sortDir}
                onClick={() => handleSort("pickRate")}
                aria-label={`Sort by ${showPresence ? "presence" : showBanRate ? "ban rate" : "pick rate"}`}
              />
            </Inline>
          </TableHead>
        )}
        {columns.includes("zScore") && (
          <SortableHeader
            label="Z-Score"
            sortKey="zScore"
            activeSortKey={activeSortKey}
            sortDir={sortDir}
            onSortChange={handleSort}
            className="w-19/100 text-center"
          >
            <Tooltip
              content={
                <>
                  Combines win rate, pick rate, and ban rate using z-scores (standard deviations from the mean).
                  Weights: {Z_SCORE_WR_WEIGHT * 100}% win rate, {Z_SCORE_PR_WEIGHT * 100}% pick rate,{" "}
                  {Z_SCORE_BR_WEIGHT * 100}% ban rate. Positive = above average, negative = below average.
                </>
              }
            >
              <Info className="size-3.5 text-muted-foreground" />
            </Tooltip>
          </SortableHeader>
        )}
        {columns.includes("residual") && (
          <SortableHeader
            label="Over/Under"
            sortKey="residual"
            activeSortKey={activeSortKey}
            sortDir={sortDir}
            onSortChange={handleSort}
            className="w-19/100 text-center"
          >
            <Tooltip
              content={
                <>
                  How much a hero over- or underperforms relative to their draft prevalence. Uses LOESS smoothing
                  (locally weighted regression) on log(presence) vs win rate, where presence = pick rate + ban rate.
                  Weighted by sample size. Positive = overperforming, negative = underperforming for how often they
                  appear in the draft.
                </>
              }
            >
              <Info className="size-3.5 text-muted-foreground" />
            </Tooltip>
          </SortableHeader>
        )}
        {columns.includes("details") && <TableHead className="w-1/20 text-center">Details</TableHead>}
      </TableRow>
    </TableHeader>
  );

  const renderHeroCells = (row: AnalyticsHeroStats) => (
    <>
      <TableCell data-pinned>
        <Stack gap={1}>
          {heroRowLinkVariant === "test" && heroNameMap.has(row.hero_id) ? (
            <TextLink asChild tone="inherit" underline="dotted">
              <Link
                to="/analytics/heroes/$heroName"
                params={{ heroName: heroSlug(heroNameMap.get(row.hero_id)!) }}
                preload="intent"
                className="flex items-center gap-2"
              >
                <HeroImage heroId={row.hero_id} />
                <span className="truncate">{heroNameMap.get(row.hero_id)}</span>
              </Link>
            </TextLink>
          ) : (
            <HeroCell heroId={row.hero_id} linkToDetail />
          )}
          {showMatchCounts && (
            <p className="text-xs text-muted-foreground tabular-nums">{row.matches.toLocaleString("en-US")} matches</p>
          )}
        </Stack>
      </TableCell>
      {columns.includes("winRate") && (
        <TableCell>
          <HeroStatTrend
            params={heroStatsQuery}
            heroId={row.hero_id}
            heroName={heroNameMap.get(row.hero_id) ?? `Hero ${row.hero_id}`}
            stat="winRate"
            bucket={trendBucket}
            onBucketChange={setTrendBucket}
            min={minWinrate}
            max={maxWinrate}
            value={row.wins / row.matches}
            color="var(--primary)"
            label={`${formatPercent(row.wins / row.matches)} `}
            delta={
              prevStatsMap?.get(row.hero_id) !== undefined
                ? row.wins / row.matches - prevStatsMap.get(row.hero_id)!.winrate
                : undefined
            }
          />
        </TableCell>
      )}
      {columns.includes("pickRate") && (
        <TableCell>
          {showPresence ? (
            (() => {
              const pickRate = pickrateMultiplier * (row.matches / sumMatches);
              const banRate = banStatsMap.get(row.hero_id) ?? 0;
              const presence = presenceMap.get(row.hero_id) ?? pickRate + banRate;
              const prev = prevStatsMap?.get(row.hero_id);
              return (
                <HeroStatTrend
                  params={heroStatsQuery}
                  heroId={row.hero_id}
                  heroName={heroNameMap.get(row.hero_id) ?? `Hero ${row.hero_id}`}
                  stat="presence"
                  bucket={trendBucket}
                  onBucketChange={setTrendBucket}
                  min={minPresence}
                  max={maxPresence}
                  value={presence}
                  label={
                    <span className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
                      <span className="flex items-baseline gap-1">
                        <span className="text-chart-4">{(pickRate * 100).toFixed(1)}%</span>
                        {prev !== undefined && <Delta value={pickRate - prev.pickrate} className="text-xs" />}
                      </span>
                      <span className="text-muted-foreground">+</span>
                      <span className="flex items-baseline gap-1">
                        <span className="text-chart-5">{(banRate * 100).toFixed(1)}%</span>
                        {prev !== undefined && <Delta value={banRate - prev.banrate} className="text-xs" />}
                      </span>
                    </span>
                  }
                  delta={undefined}
                >
                  <ProgressBarSegment value={pickRate} color="var(--chart-4)" />
                  <ProgressBarSegment value={banRate} color="var(--chart-5)" />
                </HeroStatTrend>
              );
            })()
          ) : showBanRate ? (
            (() => {
              const banRate = banStatsMap.get(row.hero_id) ?? 0;
              const prev = prevStatsMap?.get(row.hero_id);
              return (
                <HeroStatTrend
                  params={heroStatsQuery}
                  heroId={row.hero_id}
                  heroName={heroNameMap.get(row.hero_id) ?? `Hero ${row.hero_id}`}
                  stat="banRate"
                  bucket={trendBucket}
                  onBucketChange={setTrendBucket}
                  min={minBanRate}
                  max={maxBanRate}
                  value={banRate}
                  color="var(--chart-5)"
                  label={`${(banRate * 100).toFixed(1)}% `}
                  delta={prev !== undefined ? banRate - prev.banrate : undefined}
                />
              );
            })()
          ) : (
            <HeroStatTrend
              params={heroStatsQuery}
              heroId={row.hero_id}
              heroName={heroNameMap.get(row.hero_id) ?? `Hero ${row.hero_id}`}
              stat="pickRate"
              bucket={trendBucket}
              onBucketChange={setTrendBucket}
              min={minMatches}
              max={maxMatches}
              value={row.matches}
              color="var(--chart-4)"
              label={
                minHeroMatchesTotal || minHeroMatches
                  ? `${Math.round((row.matches / maxMatches) * 100).toFixed(0)}% `
                  : `${Math.round(pickrateMultiplier * (row.matches / sumMatches) * 100).toFixed(0)}% `
              }
              delta={
                prevStatsMap?.get(row.hero_id) !== undefined
                  ? minHeroMatchesTotal || minHeroMatches
                    ? row.matches / maxMatches - prevStatsMap.get(row.hero_id)!.normalizedPickrate
                    : pickrateMultiplier * (row.matches / sumMatches) - prevStatsMap.get(row.hero_id)!.pickrate
                  : undefined
              }
            />
          )}
        </TableCell>
      )}
      {columns.includes("zScore") && (
        <TableCell>
          {(() => {
            const score = zScoreMap.get(row.hero_id) ?? 0;
            const prevScore = prevStatsMap?.get(row.hero_id)?.zScore;
            const delta = prevScore !== undefined ? score - prevScore : undefined;
            return (
              <HeroStatTrend
                params={heroStatsQuery}
                heroId={row.hero_id}
                heroName={heroNameMap.get(row.hero_id) ?? `Hero ${row.hero_id}`}
                stat="zScore"
                bucket={trendBucket}
                onBucketChange={setTrendBucket}
                min={minZScore}
                max={maxZScore}
                value={score}
                color={score >= 0 ? "var(--positive)" : "var(--negative)"}
                label={`${score >= 0 ? "+" : ""}${score.toFixed(2)}`}
                delta={delta}
                deltaFormat="number"
              />
            );
          })()}
        </TableCell>
      )}
      {columns.includes("residual") && (
        <TableCell>
          {(() => {
            const data = residualMap.get(row.hero_id);
            const residual = data?.residual ?? 0;
            const prevResidual = prevStatsMap?.get(row.hero_id)?.residual;
            const delta = prevResidual !== undefined ? residual - prevResidual : undefined;
            return (
              <HeroStatTrend
                params={heroStatsQuery}
                heroId={row.hero_id}
                heroName={heroNameMap.get(row.hero_id) ?? `Hero ${row.hero_id}`}
                stat="residual"
                bucket={trendBucket}
                onBucketChange={setTrendBucket}
                min={minResidual}
                max={maxResidual}
                value={residual}
                color={residual >= 0 ? "var(--chart-3)" : "var(--muted-foreground)"}
                label={`${residual >= 0 ? "+" : ""}${(residual * 100).toFixed(2)}%`}
                delta={delta}
              />
            );
          })()}
        </TableCell>
      )}
      {columns.includes("details") && (
        <TableCell className="text-center">
          <HeroDetailsTooltip row={row} sumMatches={sumMatches} pickrateMultiplier={pickrateMultiplier} />
        </TableCell>
      )}
    </>
  );

  // Cell contents depend on the data, not the row's position in the sorted table.
  const heroCells = new Map(heroData?.map((row) => [row.hero_id, renderHeroCells(row)]));
  const renderHeroRow = (row: AnalyticsHeroStats, index: number, showIndex: boolean) => (
    <TableRow key={row.hero_id}>
      {showIndex && <TableCell className="text-center font-semibold">{index + 1}</TableCell>}
      {heroCells.get(row.hero_id)}
    </TableRow>
  );

  if (groupByType && groupedData && groupStats) {
    return (
      <div className="flex flex-col gap-4">
        {groupStats.map((group) => {
          const heroesInGroup = groupedData.get(group.type) ?? [];
          if (!heroesInGroup.some((row) => matchesNameQuery(row.hero_id))) return null;
          const config = HERO_TYPE_CONFIG[group.type];
          const winrateDelta = group.prevWinrate !== undefined ? group.winrate - group.prevWinrate : undefined;
          const pickrateDelta = group.prevPickrate !== undefined ? group.pickrate - group.prevPickrate : undefined;
          const banRateDelta = group.prevBanRate !== undefined ? group.banRate - group.prevBanRate : undefined;

          return (
            <Panel key={group.type}>
              <PanelHeader
                icon={config.icon}
                accent={config.color}
                title={
                  <>
                    {config.label}{" "}
                    <span className="font-normal text-muted-foreground">
                      ({heroesInGroup.filter((row) => matchesNameQuery(row.hero_id)).length} of {heroesInGroup.length}{" "}
                      heroes)
                    </span>
                  </>
                }
              >
                <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                  {columns.includes("winRate") && (
                    <GroupStat label="Win Rate:" value={group.winrate} delta={winrateDelta} />
                  )}
                  {columns.includes("banRate") && (
                    <GroupStat label="Ban Rate:" value={group.banRate} delta={banRateDelta} invert />
                  )}
                  {columns.includes("pickRate") &&
                    (showBanRate ? (
                      <GroupStat label="Ban Rate:" value={group.banRate} delta={banRateDelta} invert />
                    ) : showPresence ? (
                      <GroupStat
                        label="Presence:"
                        value={group.pickrate + group.banRate}
                        delta={
                          group.prevPickrate !== undefined && group.prevBanRate !== undefined
                            ? group.pickrate + group.banRate - (group.prevPickrate + group.prevBanRate)
                            : undefined
                        }
                      />
                    ) : (
                      <GroupStat label="Pick Share:" value={group.pickrate} delta={pickrateDelta} />
                    ))}
                </div>
              </PanelHeader>
              <Table>
                {renderTableHeader(true)}
                <TableBody>
                  {heroesInGroup.map((row, index) => matchesNameQuery(row.hero_id) && renderHeroRow(row, index, true))}
                </TableBody>
              </Table>
            </Panel>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Table>
        {!hideHeader && renderTableHeader(!hideIndex)}
        <TableBody>
          {limitedData?.map((row, index) => matchesNameQuery(row.hero_id) && renderHeroRow(row, index, !hideIndex))}
        </TableBody>
      </Table>
    </div>
  );
}
