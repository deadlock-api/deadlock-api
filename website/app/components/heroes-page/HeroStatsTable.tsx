import { useQuery } from "@tanstack/react-query";
import type { AnalyticsHeroStats } from "deadlock_api_client";
import type { AnalyticsApiHeroBanStatsRequest } from "deadlock_api_client/api";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Crosshair,
  Info,
  Skull,
  Sparkles,
  Swords,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import { HeroDetailsTooltip } from "~/components/heroes-page/HeroDetailsTooltip";
import { type SortDir, type SortKey, SortableHeader } from "~/components/heroes-page/SortableHeader";
import { HeroImage } from "~/components/HeroImage";
import { HeroName } from "~/components/HeroName";
import { LoadingLogo } from "~/components/LoadingLogo";
import { ProgressBarWithLabel } from "~/components/primitives/ProgressBar";
import type { GameMode } from "~/components/selectors/GameModeSelector";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { CACHE_DURATIONS } from "~/constants/cache";
import type { Dayjs } from "~/dayjs";
import { api } from "~/lib/api";
import { BANS_PER_MATCH, computeBanRates } from "~/lib/ban-rate";
import { getPickrateMultiplier } from "~/lib/constants";
import { Z_SCORE_PR_WEIGHT, Z_SCORE_WR_WEIGHT, computeResiduals, computeZScores } from "~/lib/hero-scoring";
import { cn } from "~/lib/utils";
import { heroesQueryOptions } from "~/queries/asset-queries";
import { queryKeys } from "~/queries/query-keys";

const HERO_TYPE_CONFIG: Record<string, { label: string; color: string; icon: LucideIcon }> = {
  assassin: { label: "Assassin", color: "#a855f7", icon: Skull },
  brawler: { label: "Brawler", color: "#ef4444", icon: Swords },
  marksman: { label: "Marksman", color: "#22c55e", icon: Crosshair },
  mystic: { label: "Mystic", color: "#3b82f6", icon: Sparkles },
} as const;

type HeroType = keyof typeof HERO_TYPE_CONFIG;

const HERO_TYPE_ORDER: HeroType[] = ["assassin", "brawler", "marksman", "mystic"];

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
}) {
  const [activeSortKey, setActiveSortKey] = useState<SortKey>("winrate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (key: SortKey) => {
    if (key === activeSortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setActiveSortKey(key);
      setSortDir("desc");
    }
  };

  const minDateTimestamp = useMemo(() => minDate?.unix() ?? 0, [minDate]);
  const maxDateTimestamp = useMemo(() => maxDate?.unix(), [maxDate]);

  const heroStatsQuery = {
    minHeroMatches: minHeroMatches,
    minHeroMatchesTotal: minHeroMatchesTotal,
    minAverageBadge: minRankId,
    maxAverageBadge: maxRankId,
    minUnixTimestamp: minDateTimestamp,
    maxUnixTimestamp: maxDateTimestamp,
    gameMode: gameMode,
  };
  const { data: heroData, isLoading } = useQuery({
    queryKey: queryKeys.analytics.heroStats(heroStatsQuery),
    queryFn: async () => {
      const response = await api.analytics_api.heroStats(heroStatsQuery);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_DAY,
  });

  const prevMinTimestamp = useMemo(() => prevMinDate?.unix() ?? 0, [prevMinDate]);
  const prevMaxTimestamp = useMemo(() => prevMaxDate?.unix(), [prevMaxDate]);
  const hasPreviousInterval = prevMinDate != null && prevMaxDate != null;

  const prevHeroStatsQuery = {
    minHeroMatches: minHeroMatches,
    minHeroMatchesTotal: minHeroMatchesTotal,
    minAverageBadge: minRankId,
    maxAverageBadge: maxRankId,
    minUnixTimestamp: prevMinTimestamp,
    maxUnixTimestamp: prevMaxTimestamp,
    gameMode: gameMode,
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

  const showBanRate = columns.includes("banRate");

  const banStatsQuery: AnalyticsApiHeroBanStatsRequest = {
    minAverageBadge: minRankId,
    maxAverageBadge: maxRankId,
    minUnixTimestamp: minDateTimestamp,
    maxUnixTimestamp: maxDateTimestamp,
  };
  const { data: banData } = useQuery({
    queryKey: queryKeys.analytics.heroBanStats(banStatsQuery),
    queryFn: async () => {
      const response = await api.analytics_api.heroBanStats(banStatsQuery);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_DAY,
    enabled: showBanRate,
  });

  const prevBanStatsQuery: AnalyticsApiHeroBanStatsRequest = {
    minAverageBadge: minRankId,
    maxAverageBadge: maxRankId,
    minUnixTimestamp: prevMinTimestamp,
    maxUnixTimestamp: prevMaxTimestamp,
  };
  const { data: prevBanData } = useQuery({
    queryKey: queryKeys.analytics.heroBanStats(prevBanStatsQuery),
    queryFn: async () => {
      const response = await api.analytics_api.heroBanStats(prevBanStatsQuery);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_DAY,
    enabled: showBanRate && hasPreviousInterval,
  });

  const pickrateMultiplier = getPickrateMultiplier(gameMode);

  const { data: heroes, isLoading: isLoadingHeroes } = useQuery(heroesQueryOptions);
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
      matches: row.matches,
    }));
    const prevZScores = computeZScores(heroInputs);
    const { residuals: prevResiduals } = computeResiduals(heroInputs);
    const map = new Map<
      number,
      {
        winrate: number;
        pickrate: number;
        normalizedPickrate: number;
        zScore: number;
        residual: number;
      }
    >();
    for (let i = 0; i < prevHeroData.length; i++) {
      map.set(prevHeroData[i].hero_id, {
        winrate: heroInputs[i].winrate,
        pickrate: heroInputs[i].pickrate,
        normalizedPickrate: prevHeroData[i].matches / prevMaxMatches,
        zScore: prevZScores[i],
        residual: prevResiduals[i],
      });
    }
    return map;
  }, [prevHeroData, pickrateMultiplier]);

  const { banStatsMap, banCountMap, sumBans, minBanRate, maxBanRate } = useMemo(() => {
    if (!banData || banData.length === 0)
      return {
        banStatsMap: new Map<number, number>(),
        banCountMap: new Map<number, number>(),
        sumBans: 0,
        minBanRate: 0,
        maxBanRate: 0,
      };
    const rateMap = computeBanRates(banData);
    let sumB = 0;
    const countMap = new Map<number, number>();
    for (const row of banData) {
      sumB += row.bans;
      countMap.set(row.hero_id, row.bans);
    }
    let minBR = Infinity;
    let maxBR = -Infinity;
    for (const rate of rateMap.values()) {
      if (rate < minBR) minBR = rate;
      if (rate > maxBR) maxBR = rate;
    }
    return { banStatsMap: rateMap, banCountMap: countMap, sumBans: sumB, minBanRate: minBR, maxBanRate: maxBR };
  }, [banData]);

  const prevBanStatsMap = useMemo(() => {
    if (!prevBanData) return undefined;
    return computeBanRates(prevBanData);
  }, [prevBanData]);

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
  }, [heroData, sumMatches, pickrateMultiplier]);
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
          diff = b.matches - a.matches;
          break;
        case "banRate":
          diff = (banStatsMap.get(b.hero_id) ?? 0) - (banStatsMap.get(a.hero_id) ?? 0);
          break;
      }
      return diff * dir;
    });
  }, [heroData, activeSortKey, sortDir, heroNameMap, zScoreMap, residualMap, banStatsMap]);
  const limitedData = useMemo(() => (limit ? sortedData?.slice(0, limit) : sortedData), [sortedData, limit]);

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

  if (isLoading || (groupByType && isLoadingHeroes)) {
    return (
      <div className="flex h-full w-full items-center justify-center py-16">
        <LoadingLogo />
      </div>
    );
  }

  const renderTableHeader = (showIndex: boolean) => (
    <TableHeader className="bg-muted">
      <TableRow>
        {showIndex && (
          <TableHead className="text-center" style={{ width: "1%" }}>
            #
          </TableHead>
        )}
        <TableHead style={{ width: "1%", minWidth: "10rem" }}>
          <button
            type="button"
            className="inline-flex cursor-pointer items-center justify-center gap-1 transition-colors hover:text-foreground"
            onClick={() => handleSort("hero")}
          >
            <span>Hero</span>
            {activeSortKey === "hero" ? (
              sortDir === "desc" ? (
                <ArrowDown className="size-3.5" />
              ) : (
                <ArrowUp className="size-3.5" />
              )
            ) : (
              <ArrowUpDown className="size-3.5 text-muted-foreground/50" />
            )}
          </button>
        </TableHead>
        {columns.includes("winRate") && (
          <SortableHeader
            label="Win Rate"
            sortKey="winrate"
            activeSortKey={activeSortKey}
            sortDir={sortDir}
            onSort={handleSort}
            className="w-[17%] text-center"
          />
        )}
        {columns.includes("pickRate") && (
          <SortableHeader
            label={minHeroMatchesTotal || minHeroMatches ? "Pick Rate (Normalized)" : "Pick Rate"}
            sortKey="pickRate"
            activeSortKey={activeSortKey}
            sortDir={sortDir}
            onSort={handleSort}
            className="w-[17%] text-center"
          />
        )}
        {columns.includes("banRate") && (
          <SortableHeader
            label="Ban Rate"
            sortKey="banRate"
            activeSortKey={activeSortKey}
            sortDir={sortDir}
            onSort={handleSort}
            className="w-[17%] text-center"
          />
        )}
        {columns.includes("zScore") && (
          <SortableHeader
            label="Z-Score"
            sortKey="zScore"
            activeSortKey={activeSortKey}
            sortDir={sortDir}
            onSort={handleSort}
            className="w-[17%] text-center"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="size-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-64 border border-border bg-popover p-3 text-popover-foreground shadow-md [&>svg]:bg-popover [&>svg]:fill-popover">
                Combines win rate and pick rate using z-scores (standard deviations from the mean). Weights:{" "}
                {Z_SCORE_WR_WEIGHT * 100}% win rate, {Z_SCORE_PR_WEIGHT * 100}% pick rate. Positive = above average,
                negative = below average.
              </TooltipContent>
            </Tooltip>
          </SortableHeader>
        )}
        {columns.includes("residual") && (
          <SortableHeader
            label="Over/Under"
            sortKey="residual"
            activeSortKey={activeSortKey}
            sortDir={sortDir}
            onSort={handleSort}
            className="w-[17%] text-center"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="size-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-64 border border-border bg-popover p-3 text-popover-foreground shadow-md [&>svg]:bg-popover [&>svg]:fill-popover">
                How much a hero over- or underperforms relative to their popularity. Uses LOESS smoothing (locally
                weighted regression) on log(pick rate) vs win rate, weighted by sample size. Positive = overperforming,
                negative = underperforming for their pick rate.
              </TooltipContent>
            </Tooltip>
          </SortableHeader>
        )}
        {columns.includes("details") && <TableHead className="text-center">Details</TableHead>}
      </TableRow>
    </TableHeader>
  );

  const renderHeroRow = (row: AnalyticsHeroStats, index: number, showIndex: boolean) => (
    <TableRow key={row.hero_id}>
      {showIndex && <TableCell className="text-center font-semibold">{index + 1}</TableCell>}
      <TableCell>
        <div className="flex items-center gap-2">
          <HeroImage heroId={row.hero_id} />
          <HeroName heroId={row.hero_id} />
        </div>
      </TableCell>
      {columns.includes("winRate") && (
        <TableCell>
          <ProgressBarWithLabel
            min={minWinrate}
            max={maxWinrate}
            value={row.wins / row.matches}
            color={"#fa4454"}
            label={`${Math.round((row.wins / row.matches) * 100).toFixed(0)}% `}
            delta={
              prevStatsMap?.get(row.hero_id) !== undefined
                ? row.wins / row.matches - prevStatsMap.get(row.hero_id)!.winrate
                : undefined
            }
            tooltip={
              <div className="flex flex-col gap-1 text-xs">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Matches</span>
                  <span className="font-medium">{row.matches.toLocaleString()}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Wins</span>
                  <span className="font-medium">{row.wins.toLocaleString()}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Win rate</span>
                  <span className="font-medium">{((row.wins / row.matches) * 100).toFixed(2)}%</span>
                </div>
                {prevStatsMap?.get(row.hero_id) !== undefined && (
                  <div className="mt-0.5 flex justify-between gap-4 border-t border-border pt-1">
                    <span className="text-muted-foreground">Previous</span>
                    <span className="font-medium">{(prevStatsMap.get(row.hero_id)!.winrate * 100).toFixed(2)}%</span>
                  </div>
                )}
              </div>
            }
          />
        </TableCell>
      )}
      {columns.includes("pickRate") && (
        <TableCell>
          <ProgressBarWithLabel
            min={minMatches}
            max={maxMatches}
            value={row.matches}
            color={"#22d3ee"}
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
            tooltip={
              <div className="flex flex-col gap-1 text-xs">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Matches</span>
                  <span className="font-medium">{row.matches.toLocaleString()}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Pick rate</span>
                  <span className="font-medium">
                    {(minHeroMatchesTotal || minHeroMatches
                      ? (row.matches / maxMatches) * 100
                      : pickrateMultiplier * (row.matches / sumMatches) * 100
                    ).toFixed(2)}
                    %
                  </span>
                </div>
                {prevStatsMap?.get(row.hero_id) !== undefined && (
                  <div className="mt-0.5 flex justify-between gap-4 border-t border-border pt-1">
                    <span className="text-muted-foreground">Previous</span>
                    <span className="font-medium">
                      {(
                        (minHeroMatchesTotal || minHeroMatches
                          ? prevStatsMap.get(row.hero_id)!.normalizedPickrate
                          : prevStatsMap.get(row.hero_id)!.pickrate) * 100
                      ).toFixed(2)}
                      %
                    </span>
                  </div>
                )}
              </div>
            }
          />
        </TableCell>
      )}
      {columns.includes("banRate") && (
        <TableCell>
          <ProgressBarWithLabel
            min={minBanRate}
            max={maxBanRate}
            value={banStatsMap.get(row.hero_id) ?? 0}
            color={"#f97316"}
            label={`${((banStatsMap.get(row.hero_id) ?? 0) * 100).toFixed(1)}%`}
            delta={
              prevBanStatsMap?.get(row.hero_id) !== undefined
                ? (banStatsMap.get(row.hero_id) ?? 0) - prevBanStatsMap.get(row.hero_id)!
                : undefined
            }
            tooltip={
              <div className="flex flex-col gap-1 text-xs">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Bans</span>
                  <span className="font-medium">{(banCountMap.get(row.hero_id) ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Ban Rate</span>
                  <span className="font-medium">{((banStatsMap.get(row.hero_id) ?? 0) * 100).toFixed(2)}%</span>
                </div>
                {prevBanStatsMap?.get(row.hero_id) !== undefined && (
                  <div className="mt-0.5 flex justify-between gap-4 border-t border-border pt-1">
                    <span className="text-muted-foreground">Previous</span>
                    <span className="font-medium">{(prevBanStatsMap.get(row.hero_id)! * 100).toFixed(2)}%</span>
                  </div>
                )}
              </div>
            }
          />
        </TableCell>
      )}
      {columns.includes("zScore") && (
        <TableCell>
          {(() => {
            const score = zScoreMap.get(row.hero_id) ?? 0;
            const prevScore = prevStatsMap?.get(row.hero_id)?.zScore;
            const delta = prevScore !== undefined ? score - prevScore : undefined;
            return (
              <ProgressBarWithLabel
                min={minZScore}
                max={maxZScore}
                value={score}
                color={score >= 0 ? "#10b981" : "#ef4444"}
                label={`${score >= 0 ? "+" : ""}${score.toFixed(2)}`}
                delta={delta}
                deltaFormat="raw"
                tooltip={
                  <div className="flex flex-col gap-1 text-xs">
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Win rate</span>
                      <span className="font-medium">{((row.wins / row.matches) * 100).toFixed(2)}%</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Pick rate</span>
                      <span className="font-medium">
                        {(pickrateMultiplier * (row.matches / sumMatches) * 100).toFixed(2)}%
                      </span>
                    </div>
                    <div className="mt-0.5 flex justify-between gap-4 border-t border-border pt-1">
                      <span className="text-muted-foreground">Z-Score</span>
                      <span className="font-medium">{score.toFixed(3)}</span>
                    </div>
                    {prevScore !== undefined && (
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Previous</span>
                        <span className="font-medium">{prevScore.toFixed(3)}</span>
                      </div>
                    )}
                  </div>
                }
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
            const expected = data?.expected ?? 0;
            const wr = row.wins / row.matches;
            const pr = pickrateMultiplier * (row.matches / sumMatches);
            const prevResidual = prevStatsMap?.get(row.hero_id)?.residual;
            const delta = prevResidual !== undefined ? residual - prevResidual : undefined;
            return (
              <ProgressBarWithLabel
                min={minResidual}
                max={maxResidual}
                value={residual}
                color={residual >= 0 ? "#f59e0b" : "#6b7280"}
                label={`${residual >= 0 ? "+" : ""}${(residual * 100).toFixed(2)}%`}
                delta={delta}
                tooltip={
                  <div className="flex flex-col gap-1 text-xs">
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Win rate</span>
                      <span className="font-medium">{(wr * 100).toFixed(2)}%</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Pick rate</span>
                      <span className="font-medium">{(pr * 100).toFixed(2)}%</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Expected WR</span>
                      <span className="font-medium">{(expected * 100).toFixed(2)}%</span>
                    </div>
                    <div className="mt-0.5 flex justify-between gap-4 border-t border-border pt-1">
                      <span className="text-muted-foreground">Over/Under</span>
                      <span className="font-medium">
                        {residual >= 0 ? "+" : ""}
                        {(residual * 100).toFixed(2)}%
                      </span>
                    </div>
                    {prevResidual !== undefined && (
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Previous</span>
                        <span className="font-medium">
                          {prevResidual >= 0 ? "+" : ""}
                          {(prevResidual * 100).toFixed(2)}%
                        </span>
                      </div>
                    )}
                  </div>
                }
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
    </TableRow>
  );

  if (groupByType && groupedData && groupStats) {
    return (
      <div className="flex flex-col gap-6">
        {groupStats.map((group) => {
          const heroesInGroup = groupedData.get(group.type) ?? [];
          const config = HERO_TYPE_CONFIG[group.type];
          const winrateDelta = group.prevWinrate !== undefined ? group.winrate - group.prevWinrate : undefined;
          const pickrateDelta = group.prevPickrate !== undefined ? group.pickrate - group.prevPickrate : undefined;
          const banRateDelta = group.prevBanRate !== undefined ? group.banRate - group.prevBanRate : undefined;

          return (
            <div key={group.type} className="overflow-hidden rounded-lg border border-border">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border bg-muted/50 px-4 py-3">
                <div className="flex items-center gap-2">
                  <config.icon className="size-5" style={{ color: config.color }} />
                  <h3 className="text-lg font-semibold">{config.label}</h3>
                  <span className="text-sm text-muted-foreground">({heroesInGroup.length} heroes)</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                  {columns.includes("winRate") && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">Win Rate:</span>
                      <span className="font-semibold">{(group.winrate * 100).toFixed(1)}%</span>
                      {winrateDelta !== undefined && winrateDelta !== 0 && (
                        <span
                          className={cn("text-xs font-medium", winrateDelta > 0 ? "text-green-500" : "text-red-500")}
                        >
                          {winrateDelta > 0 ? "+" : ""}
                          {(winrateDelta * 100).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  )}
                  {columns.includes("pickRate") && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">Pick Share:</span>
                      <span className="font-semibold">{(group.pickrate * 100).toFixed(1)}%</span>
                      {pickrateDelta !== undefined && pickrateDelta !== 0 && (
                        <span
                          className={cn("text-xs font-medium", pickrateDelta > 0 ? "text-green-500" : "text-red-500")}
                        >
                          {pickrateDelta > 0 ? "+" : ""}
                          {(pickrateDelta * 100).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  )}
                  {columns.includes("banRate") && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">Ban Rate:</span>
                      <span className="font-semibold">{(group.banRate * 100).toFixed(1)}%</span>
                      {banRateDelta !== undefined && banRateDelta !== 0 && (
                        <span
                          className={cn("text-xs font-medium", banRateDelta > 0 ? "text-red-500" : "text-green-500")}
                        >
                          {banRateDelta > 0 ? "+" : ""}
                          {(banRateDelta * 100).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <Table>
                {renderTableHeader(true)}
                <TableBody>{heroesInGroup.map((row, index) => renderHeroRow(row, index, true))}</TableBody>
              </Table>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <Table>
      {!hideHeader && renderTableHeader(!hideIndex)}
      <TableBody>{limitedData?.map((row, index) => renderHeroRow(row, index, !hideIndex))}</TableBody>
    </Table>
  );
}
