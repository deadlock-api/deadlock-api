import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { HeroCell } from "~/components/domain/assets/HeroCell";
import { TableEmptyRow } from "~/components/patterns/data-table/TableEmptyRow";
import { PanelShowMore } from "~/components/patterns/panel/Panel";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { Delta } from "~/components/ui/delta";
import { DivergingBar } from "~/components/ui/rate-bar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Tooltip, TooltipStat, TooltipStats, TooltipTarget } from "~/components/ui/tooltip";
import { CACHE_DURATIONS } from "~/constants/cache";
import type { Dayjs } from "~/dayjs";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import type { GameMode, MatchMode } from "~/lib/game-mode";
import { heroMatchups, type HeroMatchups } from "~/lib/matchup-stats";
import { heroCounterWinsQueryOptions, heroSynergyWinsQueryOptions } from "~/queries/hero-matchup-query";
import { heroStatsQueryOptions } from "~/queries/hero-stats-query";

export type { MatchupRow } from "~/lib/matchup-stats";

export enum HeroMatchupDetailsStatsTableStat {
  SYNERGY = 0,
  COUNTER = 1,
}

export interface HeroMatchupParams {
  heroId: number;
  minRankId?: number;
  maxRankId?: number;
  minDate?: Dayjs;
  maxDate?: Dayjs;
  prevMinDate?: Dayjs;
  prevMaxDate?: Dayjs;
  sameLaneFilter?: boolean;
  minHeroMatches?: number;
  gameMode?: GameMode;
  matchMode?: MatchMode;
}

/** Teammate and opponent rows for `heroId`, each sorted from the biggest win rate gain to the biggest loss. */
export function useHeroMatchupRows({
  heroId,
  minRankId,
  maxRankId,
  minDate,
  maxDate,
  prevMinDate,
  prevMaxDate,
  sameLaneFilter,
  minHeroMatches,
  gameMode,
  matchMode,
}: HeroMatchupParams) {
  const { minUnixTimestamp, maxUnixTimestamp } = useNormalizedTimeRange(minDate, maxDate);
  const { minUnixTimestamp: prevMinTimestamp, maxUnixTimestamp: prevMaxTimestamp } = useNormalizedTimeRange(
    prevMinDate,
    prevMaxDate,
  );

  const heroStatsQuery = {
    minHeroMatches: minHeroMatches ?? 0,
    // Stated although 0 is the default: the hero page asks for the same stats with it, and only an identical
    // query key shares the cached response instead of fetching /hero-stats a second time.
    minHeroMatchesTotal: 0,
    minAverageBadge: minRankId,
    maxAverageBadge: maxRankId,
    minUnixTimestamp: minUnixTimestamp ?? 0,
    maxUnixTimestamp,
    gameMode: gameMode,
    matchMode,
  };
  const {
    data: heroData,
    isLoading: isLoadingHero,
    isError: isHeroError,
    refetch: refetchHero,
  } = useQuery({
    ...heroStatsQueryOptions(heroStatsQuery),
    staleTime: CACHE_DURATIONS.ONE_DAY,
  });

  const synergyStatsQuery = {
    sameLaneFilter: sameLaneFilter,
    minMatches: minHeroMatches ?? 0,
    minAverageBadge: minRankId,
    maxAverageBadge: maxRankId,
    minUnixTimestamp: minUnixTimestamp ?? 0,
    maxUnixTimestamp,
    gameMode: gameMode,
    matchMode,
  };
  const {
    data: synergyData,
    isLoading: isLoadingSynergy,
    isError: isSynergyError,
    refetch: refetchSynergy,
  } = useQuery(heroSynergyWinsQueryOptions(synergyStatsQuery));

  const counterStatsQuery = {
    sameLaneFilter: sameLaneFilter,
    minMatches: minHeroMatches ?? 0,
    minAverageBadge: minRankId,
    maxAverageBadge: maxRankId,
    minUnixTimestamp: minUnixTimestamp ?? 0,
    maxUnixTimestamp,
    gameMode: gameMode,
    matchMode,
  };
  const {
    data: counterData,
    isLoading: isLoadingCounter,
    isError: isCounterError,
    refetch: refetchCounter,
  } = useQuery(heroCounterWinsQueryOptions(counterStatsQuery));

  const hasPreviousInterval = prevMinDate != null && prevMaxDate != null;

  const prevHeroStatsQuery = {
    minHeroMatches: minHeroMatches ?? 0,
    minAverageBadge: minRankId,
    maxAverageBadge: maxRankId,
    minUnixTimestamp: prevMinTimestamp ?? 0,
    maxUnixTimestamp: prevMaxTimestamp,
    gameMode: gameMode,
    matchMode,
  };
  const { data: prevHeroData } = useQuery({
    ...heroStatsQueryOptions(prevHeroStatsQuery),
    staleTime: CACHE_DURATIONS.ONE_DAY,
    enabled: hasPreviousInterval,
  });

  const prevSynergyStatsQuery = {
    sameLaneFilter: sameLaneFilter,
    minMatches: minHeroMatches ?? 0,
    minAverageBadge: minRankId,
    maxAverageBadge: maxRankId,
    minUnixTimestamp: prevMinTimestamp ?? 0,
    maxUnixTimestamp: prevMaxTimestamp,
    gameMode: gameMode,
    matchMode,
  };
  const { data: prevSynergyData } = useQuery({
    ...heroSynergyWinsQueryOptions(prevSynergyStatsQuery),
    enabled: hasPreviousInterval,
  });

  const prevCounterStatsQuery = {
    sameLaneFilter: sameLaneFilter,
    minMatches: minHeroMatches ?? 0,
    minAverageBadge: minRankId,
    maxAverageBadge: maxRankId,
    minUnixTimestamp: prevMinTimestamp ?? 0,
    maxUnixTimestamp: prevMaxTimestamp,
    gameMode: gameMode,
    matchMode,
  };
  const { data: prevCounterData } = useQuery({
    ...heroCounterWinsQueryOptions(prevCounterStatsQuery),
    enabled: hasPreviousInterval,
  });

  const isLoading = isLoadingSynergy || isLoadingCounter || isLoadingHero;

  const { synergyRows, counterRows } = useMemo(
    () =>
      heroMatchups(
        heroId,
        { heroStats: heroData ?? [], synergies: synergyData ?? [], counters: counterData ?? [] },
        hasPreviousInterval
          ? { heroStats: prevHeroData ?? [], synergies: prevSynergyData ?? [], counters: prevCounterData ?? [] }
          : undefined,
      ),
    [heroId, heroData, synergyData, counterData, hasPreviousInterval, prevHeroData, prevSynergyData, prevCounterData],
  );

  return {
    synergyRows,
    counterRows,
    isLoading,
    heroStats: heroData?.find((hero) => hero.hero_id === heroId),
    isError: isHeroError || isSynergyError || isCounterError,
    retry: () => Promise.all([refetchHero(), refetchSynergy(), refetchCounter()]),
  };
}

/** Rows shown before "Show all": the full list of every hero ran to 37 rows per table. */
const COLLAPSED_ROWS = 10;

/** The rows of one side of the matchups, the last rows of a `Panel`: the first ten, then a "Show all" row. */
export function HeroMatchupDetailsStatsTable({
  stat,
  matchups,
  onRetry,
  linkHeroes,
}: {
  stat: HeroMatchupDetailsStatsTableStat;
  /** Undefined when the matchups failed to load. */
  matchups: HeroMatchups | undefined;
  onRetry?: () => void;
  linkHeroes?: boolean;
}) {
  const isSynergy = stat === HeroMatchupDetailsStatsTableStat.SYNERGY;
  const rows = (isSynergy ? matchups?.synergyRows : matchups?.counterRows) ?? [];
  // One symmetric scale for the table, so a bar's length compares across rows and its side gives the sign.
  const scale = rows.reduce((max, row) => Math.max(max, Math.abs(row.relWinrate)), 0);
  const [expanded, setExpanded] = useState(false);
  const visibleRows = expanded ? rows : rows.slice(0, COLLAPSED_ROWS);

  if (!matchups) {
    return <ErrorState variant="inline" title="Hero matchups did not load" onRetry={onRetry} className="p-4" />;
  }

  return (
    <>
      <Table>
        <TableHeader tone="muted">
          <TableRow>
            <TableHead className="text-center">#</TableHead>
            <TableHead data-pinned>Hero</TableHead>
            <TableHead className="whitespace-normal">Win Rate Change</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableEmptyRow colSpan={3}>No matchups with enough matches for these filters</TableEmptyRow>
          )}
          {visibleRows.map((row, index) => (
            <TableRow key={row.heroId}>
              <TableCell>{index + 1}</TableCell>
              <TableCell data-pinned>
                <HeroCell heroId={row.heroId} linkToDetail={linkHeroes} />
              </TableCell>
              <TableCell>
                <Tooltip
                  content={
                    <>
                      <TooltipStats variant="plain">
                        <TooltipStat label="Matches" value={row.matches.toLocaleString("en-US")} />
                        <TooltipStat label="Wins" value={row.wins.toLocaleString("en-US")} />
                        <TooltipStat label="Win rate change" value={<Delta value={row.relWinrate} digits={2} />} />
                      </TooltipStats>
                      {row.prevRelWinrate !== undefined && (
                        <TooltipStats>
                          <TooltipStat label="Previous" value={<Delta value={row.prevRelWinrate} digits={2} />} />
                        </TooltipStats>
                      )}
                    </>
                  }
                >
                  <TooltipTarget display="block">
                    <span className="flex min-w-32 items-center gap-3">
                      <Delta value={row.relWinrate} className="w-14 shrink-0 text-end text-sm" />
                      <DivergingBar value={row.relWinrate} scale={scale} className="flex-1" />
                    </span>
                  </TooltipTarget>
                </Tooltip>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length > COLLAPSED_ROWS && <PanelShowMore open={expanded} total={rows.length} onOpenChange={setExpanded} />}
    </>
  );
}
