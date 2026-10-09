import { useQuery } from "@tanstack/react-query";
import type { AnalyticsHeroStats } from "deadlock_api_client";
import { parseAsStringLiteral, useQueryState } from "nuqs";

import { HeroCell } from "~/components/domain/assets/HeroCell";
import { HeroImage } from "~/components/domain/assets/HeroImage";
import { HeroName } from "~/components/domain/assets/HeroName";
import { CHART_COLOR } from "~/components/patterns/charts/theme";
import { SortableHeader } from "~/components/patterns/data-table/SortableHeader";
import { TableEmptyRow } from "~/components/patterns/data-table/TableEmptyRow";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Delta } from "~/components/ui/delta";
import { sortParams, useSort } from "~/components/ui/hooks/use-sort";
import { ProgressBarWithLabel } from "~/components/ui/progress-bar";
import type { SortDir } from "~/components/ui/sort-button";
import { Inline } from "~/components/ui/stack";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Tooltip, TooltipHeader, TooltipStat, TooltipStats, TooltipTarget } from "~/components/ui/tooltip";
import type { Dayjs } from "~/dayjs";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { findKey } from "~/lib/find-keys";
import { formatSignedPercent } from "~/lib/format";
import type { GameMode, MatchMode } from "~/lib/game-mode";
import { heroesQueryOptions } from "~/queries/asset-queries";
import {
  type HeroCounterWins,
  heroCounterWinsQueryOptions,
  type HeroSynergyWins,
  heroSynergyWinsQueryOptions,
} from "~/queries/hero-matchup-query";
import { heroStatsQueryOptions } from "~/queries/hero-stats-query";
import type { Color } from "~/types/general";

type SynergyEntry = HeroSynergyWins & {
  rel_winrate: number;
};

type CounterEntry = HeroCounterWins & { rel_winrate: number };

function buildHeroStatsMap(data: AnalyticsHeroStats[] | undefined): Record<number, AnalyticsHeroStats> {
  const map: Record<number, AnalyticsHeroStats> = {};
  for (const hero of data || []) {
    if (!hero?.matches || !hero?.wins) continue;
    map[hero.hero_id] = hero;
  }
  return map;
}

function buildSynergyMap(
  synergyData: HeroSynergyWins[] | undefined,
  heroStatsMap: Record<number, AnalyticsHeroStats>,
): Record<number, SynergyEntry[]> {
  const synergyMap: Record<number, SynergyEntry[]> = {};
  for (const synergy of synergyData || []) {
    if (!synergy?.matches_played || synergy.wins == null) continue;
    if (!heroStatsMap[synergy.hero_id2]?.matches || !heroStatsMap[synergy.hero_id1]?.matches) continue;
    if (!synergyMap[synergy.hero_id1]) synergyMap[synergy.hero_id1] = [];
    if (!synergyMap[synergy.hero_id2]) synergyMap[synergy.hero_id2] = [];
    const rel_winrate =
      synergy.wins / synergy.matches_played -
      (heroStatsMap[synergy.hero_id1].wins / heroStatsMap[synergy.hero_id1].matches +
        heroStatsMap[synergy.hero_id2].wins / heroStatsMap[synergy.hero_id2].matches) /
        2;
    synergyMap[synergy.hero_id1].push({ ...synergy, rel_winrate });
    synergyMap[synergy.hero_id2].push({
      hero_id1: synergy.hero_id2,
      hero_id2: synergy.hero_id1,
      wins: synergy.wins,
      matches_played: synergy.matches_played,
      rel_winrate,
    });
  }
  return synergyMap;
}

/** Each hero's matchup with the highest (best) or lowest (worst) relative win rate; the first one listed on a tie. */
function pickTopFromMap<T extends { rel_winrate: number }>(
  map: Record<number, T[]>,
  direction: "best" | "worst",
): Record<number, T> {
  const result: Record<number, T> = {};
  for (const [heroId, entries] of Object.entries(map)) {
    let top: T | undefined;
    for (const entry of entries) {
      if (!top || (direction === "best" ? entry.rel_winrate > top.rel_winrate : entry.rel_winrate < top.rel_winrate)) {
        top = entry;
      }
    }
    if (top) result[Number(heroId)] = top;
  }
  return result;
}

/** Each hero's relative win rate with or against each partner, from a synergy or counter map. */
function relWinrateLookup<T extends { rel_winrate: number }>(
  map: Record<number, T[]>,
  partnerOf: (entry: T) => number,
): Record<number, Record<number, number>> {
  const lookup: Record<number, Record<number, number>> = {};
  for (const [heroId, entries] of Object.entries(map)) {
    lookup[Number(heroId)] = Object.fromEntries(entries.map((entry) => [partnerOf(entry), entry.rel_winrate]));
  }
  return lookup;
}

function buildCounterMap(
  counterData: HeroCounterWins[] | undefined,
  heroStatsMap: Record<number, AnalyticsHeroStats>,
): Record<number, CounterEntry[]> {
  const counterMap: Record<number, CounterEntry[]> = {};
  for (const counter of counterData || []) {
    if (!counter?.matches_played || counter.wins == null) continue;
    if (!heroStatsMap[counter.hero_id]?.matches || !heroStatsMap[counter.hero_id]?.wins) continue;
    if (!counterMap[counter.hero_id]) counterMap[counter.hero_id] = [];
    counterMap[counter.hero_id].push({
      ...counter,
      rel_winrate:
        counter.wins / counter.matches_played -
        heroStatsMap[counter.hero_id].wins / heroStatsMap[counter.hero_id].matches,
    });
  }
  return counterMap;
}

const SORT_KEYS = ["hero", "bestCombination", "worstCombination", "bestAgainst", "worstAgainst"] as const;
type SortKey = (typeof SORT_KEYS)[number];
const parseAsSortKey = parseAsStringLiteral(SORT_KEYS);
const parseAsSortDir = parseAsStringLiteral(["asc", "desc"] as const);

/**
 * The direction a column sorts in when it is first picked: names A to Z, and every matchup column with its biggest
 * effect first. For the "worst" columns that is the most negative value, so they start ascending.
 */
const FIRST_DIR: Record<SortKey, SortDir> = {
  hero: "asc",
  bestCombination: "desc",
  worstCombination: "asc",
  bestAgainst: "desc",
  worstAgainst: "asc",
};

/** The largest effect in a column, in either direction. Bars run from 0 to it, so a bigger effect is a longer bar. */
function getMaxMagnitude(entries: Record<number, { rel_winrate: number }>): number {
  let max = 0;
  for (const entry of Object.values(entries)) max = Math.max(max, Math.abs(entry.rel_winrate));
  return max;
}

function MatchupTooltip({
  heroId,
  partnerId,
  separator,
  matchesPlayed,
  wins,
  relWinrate,
  prevRelWinrate,
}: {
  heroId: number;
  partnerId: number;
  separator: string;
  matchesPlayed: number;
  wins: number;
  relWinrate: number;
  prevRelWinrate: number | undefined;
}) {
  return (
    <>
      <TooltipHeader
        title={
          <Inline gap={1.5}>
            <HeroName heroId={heroId} />
            <span className="text-muted-foreground">{separator}</span>
            <HeroName heroId={partnerId} />
          </Inline>
        }
      />
      <TooltipStats>
        <TooltipStat label="Matches" value={matchesPlayed.toLocaleString("en-US")} />
        <TooltipStat label="Wins" value={wins.toLocaleString("en-US")} />
        <TooltipStat label="Win rate" value={`${((wins / matchesPlayed) * 100).toFixed(2)}%`} />
        <TooltipStat label="Win rate change" value={<Delta value={relWinrate} digits={2} />} />
      </TooltipStats>
      {prevRelWinrate !== undefined && (
        <TooltipStats>
          <TooltipStat label="Previous" value={<Delta value={prevRelWinrate} digits={2} />} />
        </TooltipStats>
      )}
    </>
  );
}

/** A row's matchup in one column: the partner, how much they move the win rate, and that change last interval. */
interface Matchup {
  partnerId: number;
  matches_played: number;
  wins: number;
  rel_winrate: number;
}

function MatchupCell({
  heroId,
  matchup,
  prevRelWinrates,
  maxMagnitude,
  color,
  separator,
}: {
  heroId: number;
  matchup: Matchup | undefined;
  /** This hero's relative win rate with or against each partner in the previous interval. */
  prevRelWinrates: Record<number, number> | undefined;
  maxMagnitude: number;
  color: Color;
  separator: string;
}) {
  if (!matchup) return <TableCell />;

  const { partnerId, rel_winrate: relWinrate } = matchup;
  const prevRelWinrate = prevRelWinrates?.[partnerId];
  return (
    <TableCell>
      <Inline wrap="nowrap">
        <HeroImage heroId={partnerId} />
        <Tooltip
          content={
            <MatchupTooltip
              heroId={heroId}
              partnerId={partnerId}
              separator={separator}
              matchesPlayed={matchup.matches_played}
              wins={matchup.wins}
              relWinrate={relWinrate}
              prevRelWinrate={prevRelWinrate}
            />
          }
        >
          <TooltipTarget display="block" className="w-full">
            <ProgressBarWithLabel
              min={0}
              max={maxMagnitude}
              value={Math.abs(relWinrate)}
              color={color}
              label={formatSignedPercent(relWinrate)}
              delta={prevRelWinrate !== undefined ? relWinrate - prevRelWinrate : undefined}
            />
          </TooltipTarget>
        </Tooltip>
      </Inline>
    </TableCell>
  );
}

const synergyMatchup = (synergy: SynergyEntry | undefined): Matchup | undefined =>
  synergy && { ...synergy, partnerId: synergy.hero_id2 };
const counterMatchup = (counter: CounterEntry | undefined): Matchup | undefined =>
  counter && { ...counter, partnerId: counter.enemy_hero_id };

export function HeroMatchupStatsTable({
  hideHeader,
  minRankId,
  maxRankId,
  minMatches,
  minDate,
  maxDate,
  prevMinDate,
  prevMaxDate,
  sameLaneFilter,
  gameMode,
  matchMode,
}: {
  hideHeader?: boolean;
  minRankId?: number;
  maxRankId?: number;
  minMatches?: number;
  minDate?: Dayjs;
  maxDate?: Dayjs;
  prevMinDate?: Dayjs;
  prevMaxDate?: Dayjs;
  sameLaneFilter?: boolean;
  gameMode?: GameMode;
  matchMode?: MatchMode;
}) {
  const { minUnixTimestamp, maxUnixTimestamp } = useNormalizedTimeRange(minDate, maxDate);
  const { minUnixTimestamp: prevMinTimestamp, maxUnixTimestamp: prevMaxTimestamp } = useNormalizedTimeRange(
    prevMinDate,
    prevMaxDate,
  );

  const hasPreviousInterval = prevMinDate != null && prevMaxDate != null;
  const range = { minUnixTimestamp: minUnixTimestamp ?? 0, maxUnixTimestamp };
  const prevRange = { minUnixTimestamp: prevMinTimestamp ?? 0, maxUnixTimestamp: prevMaxTimestamp };
  const filters = { minAverageBadge: minRankId, maxAverageBadge: maxRankId, gameMode, matchMode };
  const heroStatsQuery = { ...filters, minHeroMatches: minMatches };
  const matchupQuery = { ...filters, sameLaneFilter, minMatches };

  const {
    data: heroData,
    isLoading: isLoadingHero,
    isError: isHeroError,
    refetch: refetchHero,
  } = useQuery(heroStatsQueryOptions({ ...heroStatsQuery, ...range }));
  const {
    data: synergyData,
    isLoading: isLoadingSynergy,
    isError: isSynergyError,
    refetch: refetchSynergy,
  } = useQuery(heroSynergyWinsQueryOptions({ ...matchupQuery, ...range }));
  const {
    data: counterData,
    isLoading: isLoadingCounter,
    isError: isCounterError,
    refetch: refetchCounter,
  } = useQuery(heroCounterWinsQueryOptions({ ...matchupQuery, ...range }));

  const { data: prevHeroData } = useQuery({
    ...heroStatsQueryOptions({ ...heroStatsQuery, ...prevRange }),
    enabled: hasPreviousInterval,
  });
  const { data: prevSynergyData } = useQuery({
    ...heroSynergyWinsQueryOptions({ ...matchupQuery, ...prevRange }),
    enabled: hasPreviousInterval,
  });
  const { data: prevCounterData } = useQuery({
    ...heroCounterWinsQueryOptions({ ...matchupQuery, ...prevRange }),
    enabled: hasPreviousInterval,
  });

  const { data: heroes } = useQuery(heroesQueryOptions);
  const heroNameMap = new Map((heroes ?? []).map((hero) => [hero.id, hero.name]));

  const [activeSortKey, setActiveSortKey] = useQueryState(
    "matchup_sort_key",
    parseAsSortKey.withDefault("bestCombination"),
  );
  const [sortDir, setSortDir] = useQueryState("matchup_sort_dir", parseAsSortDir.withDefault("desc"));
  const { toggle: handleSort } = useSort({
    ...sortParams([activeSortKey, setActiveSortKey], [sortDir, setSortDir]),
    firstDir: (key) => FIRST_DIR[key],
  });

  const isLoading = isLoadingSynergy || isLoadingCounter || isLoadingHero;

  const heroStatsMap = buildHeroStatsMap(heroData);
  const prevHeroStatsMap = buildHeroStatsMap(prevHeroData);

  const prevSynergyRelWinrateMap = relWinrateLookup(
    buildSynergyMap(prevSynergyData, prevHeroStatsMap),
    (synergy) => synergy.hero_id2,
  );
  const prevCounterRelWinrateMap = relWinrateLookup(
    buildCounterMap(prevCounterData, prevHeroStatsMap),
    (counter) => counter.enemy_hero_id,
  );

  const synergyMap = buildSynergyMap(synergyData, heroStatsMap);
  const counterMap = buildCounterMap(counterData, heroStatsMap);

  const heroBestSynergies = pickTopFromMap(synergyMap, "best");
  const heroWorstSynergies = pickTopFromMap(synergyMap, "worst");
  const heroBestAgainst = pickTopFromMap(counterMap, "best");
  const heroWorstAgainst = pickTopFromMap(counterMap, "worst");

  const bestSynergyScale = getMaxMagnitude(heroBestSynergies);
  const worstSynergyScale = getMaxMagnitude(heroWorstSynergies);
  const bestAgainstScale = getMaxMagnitude(heroBestAgainst);
  const worstAgainstScale = getMaxMagnitude(heroWorstAgainst);

  const heroIds = [
    ...new Set(
      [...Object.keys(heroBestSynergies), ...Object.keys(heroBestAgainst)].map((id) => Number.parseInt(id, 10)),
    ),
  ];

  const columnOf: Record<Exclude<SortKey, "hero">, Record<number, { rel_winrate: number }>> = {
    bestCombination: heroBestSynergies,
    worstCombination: heroWorstSynergies,
    bestAgainst: heroBestAgainst,
    worstAgainst: heroWorstAgainst,
  };
  const dir = sortDir === "asc" ? 1 : -1;
  const nameOf = (heroId: number) => heroNameMap.get(heroId) ?? "";
  const sortedHeroIds = heroIds.toSorted((a, b) => {
    if (activeSortKey === "hero") return nameOf(a).localeCompare(nameOf(b)) * dir;
    const va = columnOf[activeSortKey][a]?.rel_winrate;
    const vb = columnOf[activeSortKey][b]?.rel_winrate;
    // A hero without a matchup in this column sits at the bottom whichever way it is sorted.
    if (va == null || vb == null) {
      if (va == null && vb == null) return nameOf(a).localeCompare(nameOf(b));
      return va == null ? 1 : -1;
    }
    return (va - vb) * dir || nameOf(a).localeCompare(nameOf(b));
  });
  const sortProps = { activeSortKey, sortDir, onSortChange: handleSort, align: "start" } as const;

  if (isLoading) {
    return <LoadingState label="hero matchups" align="center" />;
  }

  if ((isHeroError || isSynergyError || isCounterError) && heroIds.length === 0) {
    return (
      <ErrorState
        title="Hero matchups did not load"
        onRetry={() => void Promise.all([refetchHero(), refetchSynergy(), refetchCounter()])}
      />
    );
  }

  return (
    <Table>
      {!hideHeader && (
        <TableHeader tone="muted">
          <TableRow>
            <TableHead>#</TableHead>
            <SortableHeader label="Hero" sortKey="hero" {...sortProps} data-pinned />
            <SortableHeader
              label="Best Combination"
              sortKey="bestCombination"
              {...sortProps}
              title="Win rate change with the best teammate"
            />
            <SortableHeader
              label="Worst Combination"
              sortKey="worstCombination"
              {...sortProps}
              title="Win rate change with the worst teammate"
            />
            <SortableHeader
              label="Best Against"
              sortKey="bestAgainst"
              {...sortProps}
              title="Win rate change against the easiest enemy"
            />
            <SortableHeader
              label="Worst Against"
              sortKey="worstAgainst"
              {...sortProps}
              title="Win rate change against the hardest enemy"
            />
          </TableRow>
        </TableHeader>
      )}
      <TableBody>
        {heroIds.length === 0 && (
          <TableEmptyRow colSpan={6}>No matchups with enough matches for these filters</TableEmptyRow>
        )}
        {sortedHeroIds.map((heroId, index) => (
          <TableRow key={heroId} data-find={findKey.hero(heroId)}>
            <TableCell className="font-semibold">{index + 1}</TableCell>
            <TableCell data-pinned>
              <HeroCell heroId={heroId} />
            </TableCell>
            <MatchupCell
              heroId={heroId}
              matchup={synergyMatchup(heroBestSynergies[heroId])}
              prevRelWinrates={prevSynergyRelWinrateMap[heroId]}
              maxMagnitude={bestSynergyScale}
              color={CHART_COLOR.primary}
              separator="+"
            />
            <MatchupCell
              heroId={heroId}
              matchup={synergyMatchup(heroWorstSynergies[heroId])}
              prevRelWinrates={prevSynergyRelWinrateMap[heroId]}
              maxMagnitude={worstSynergyScale}
              color={CHART_COLOR.primary}
              separator="+"
            />
            <MatchupCell
              heroId={heroId}
              matchup={counterMatchup(heroBestAgainst[heroId])}
              prevRelWinrates={prevCounterRelWinrateMap[heroId]}
              maxMagnitude={bestAgainstScale}
              color={CHART_COLOR.pickRate}
              separator="vs"
            />
            <MatchupCell
              heroId={heroId}
              matchup={counterMatchup(heroWorstAgainst[heroId])}
              prevRelWinrates={prevCounterRelWinrateMap[heroId]}
              maxMagnitude={worstAgainstScale}
              color={CHART_COLOR.pickRate}
              separator="vs"
            />
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
