import { useQuery } from "@tanstack/react-query";
import type { HeroScoreboardSortByEnum } from "deadlock_api_client";
import { parseAsBoolean, parseAsInteger, parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { startTransition, Suspense } from "react";

import { SortBySelector } from "~/components/domain/player-scoreboard/SortBySelector";
import { HeroSelector } from "~/components/domain/selectors/HeroSelector";
import { HeroCombFilters } from "~/components/features/heroes/HeroCombFilters";
import { HeroLaneFilter } from "~/components/features/heroes/HeroLaneFilter";
import { HeroScoreboardTable } from "~/components/features/heroes/HeroScoreboardTable";
import { HeroStatSelector } from "~/components/features/heroes/HeroStatSelectors";
import { HeroStatsTable } from "~/components/features/heroes/HeroStatsTable";
import { HeroTrendControls } from "~/components/features/heroes/HeroTrendControls";
import { FilterToggleCell } from "~/components/patterns/filter-bar/FilterCell";
import { StringOption, StringOptionGroup, StringSelector } from "~/components/patterns/filter-bar/StringSelector";
import { Section } from "~/components/patterns/page/Section";
import { ChunkErrorBoundary } from "~/components/patterns/states/ChunkErrorBoundary";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { QueryRenderer } from "~/components/patterns/states/QueryRenderer";
import { Button } from "~/components/ui/button";
import { SegmentedItem } from "~/components/ui/segmented";
import type { useHeroFilters } from "~/hooks/useHeroFilters";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { useExperiment } from "~/lib/experiments";
import { hasSoulEconomy, MODE_CONFIG } from "~/lib/game-mode";
import { TIER_METRIC_DEFINITIONS, TIER_METRICS, type TierMetric, type TierMetricDefinition } from "~/lib/hero-tiers";
import { HERO_SORT_BY_VALUES, sortByIn } from "~/lib/scoreboard-sorts";
import { heroScoreboardQueryOptions } from "~/queries/hero-scoreboard-query";
import { BY_RANK_STATS, HERO_STATS, heroStatsFor } from "~/types/api_hero_stats";

import {
  HeroCombStatsTable,
  HeroMatchupExplorer,
  HeroMatchupStatsTable,
  HeroStatsByDurationChart,
  HeroStatsByExperienceTable,
  HeroStatsByRankChart,
  HeroStatsOverTimeChart,
  HeroTierList,
} from "./heroes-views";

/** The page's filters, shared by every tab; each tab owns its own controls and their URL params. */
type HeroFilters = ReturnType<typeof useHeroFilters>;

/** "Group by Type", shared by the overall table and the tier list: one URL param, `group_by_type`. */
function useGroupByType() {
  return useQueryState("group_by_type", parseAsBoolean.withDefault(false));
}

/** The overall table's name search; replace, so each keystroke is not a history entry. */
function useHeroNameQuery() {
  return useQueryState("hero_q", parseAsString.withDefault("").withOptions({ history: "replace" }));
}

/** The overall table's minimum of its pick rate column, in percent. */
function useHeroMinPickRate() {
  return useQueryState("min_pick_rate", parseAsInteger.withDefault(0));
}

/**
 * The tier list's ranking metric. Street Brawl has neither bans nor a soul economy: those metrics leave the list, and
 * one chosen in another mode falls back to the tier score while the URL keeps it.
 */
function useTierMetric(filters: HeroFilters) {
  const [tierMetric, setTierMetric] = useQueryState(
    "tier_metric",
    parseAsStringLiteral(TIER_METRICS).withDefault("score"),
  );
  const tierMetrics = TIER_METRICS.filter((metric) => {
    const definition: TierMetricDefinition = TIER_METRIC_DEFINITIONS[metric];
    return hasSoulEconomy(filters.gameMode) || (!definition.bans && !definition.economy);
  });
  const shownTierMetric = tierMetrics.includes(tierMetric) ? tierMetric : "score";
  return { tierMetrics, shownTierMetric, setTierMetric };
}

/**
 * The scoreboard's sort. Heroes only: a link or a stale URL with a player-only sort (rank) falls back to the default
 * instead of a 400, and in Street Brawl, which has no soul economy, a net worth sort falls back while the URL keeps it.
 */
function useScoreboardSortBy(filters: HeroFilters) {
  const [chosenSortBy, setSortBy] = useQueryState(
    "scoreboard_sort_by",
    parseAsStringLiteral(HERO_SORT_BY_VALUES as [string, ...string[]]).withDefault("winrate"),
  );
  return { sortBy: sortByIn(chosenSortBy, filters.gameMode, "winrate"), setSortBy };
}

function GroupByTypeSwitch() {
  const [groupByType, setGroupByType] = useGroupByType();
  return (
    <FilterToggleCell
      label="Group by"
      value={groupByType ? "type" : "none"}
      defaultValue="none"
      onValueChange={(next) => void setGroupByType(next === "type" || null)}
    >
      <SegmentedItem value="none">None</SegmentedItem>
      <SegmentedItem value="type">Hero type</SegmentedItem>
    </FilterToggleCell>
  );
}

function TierListControls({ filters }: { filters: HeroFilters }) {
  const { tierMetrics, shownTierMetric, setTierMetric } = useTierMetric(filters);
  return (
    <>
      <StringSelector
        label="Rank by"
        size="sm"
        value={shownTierMetric}
        defaultValue="score"
        onValueChange={(value) => void setTierMetric(value as TierMetric)}
      >
        {(["Draft", "Combat", "Economy"] as const).map((group) => (
          <StringOptionGroup key={group} label={group}>
            {tierMetrics
              .filter((metric) => TIER_METRIC_DEFINITIONS[metric].group === group)
              .map((metric) => (
                <StringOption key={metric} value={metric}>
                  {TIER_METRIC_DEFINITIONS[metric].label}
                </StringOption>
              ))}
          </StringOptionGroup>
        ))}
      </StringSelector>
      <GroupByTypeSwitch />
    </>
  );
}

function ScoreboardControls({ filters }: { filters: HeroFilters }) {
  const { sortBy, setSortBy } = useScoreboardSortBy(filters);
  return (
    <SortBySelector
      scope="heroes"
      gameMode={filters.gameMode}
      size="sm"
      value={sortBy}
      defaultValue="winrate"
      onValueChange={(value) => void setSortBy(value)}
    />
  );
}

/**
 * The open tab's own controls, drawn at the end of the page's filter row: one row of controls per page, never a
 * second bar inside the tab. Every one of them keeps its state in the URL, which the tab's body reads.
 */
export function HeroTabControls({ filters }: { filters: HeroFilters }) {
  switch (filters.tab) {
    case "stats":
      return <GroupByTypeSwitch />;
    case "tier-list":
      return <TierListControls filters={filters} />;
    case "stats-over-time":
      return (
        <HeroTrendControls
          stat={filters.heroStat}
          interval={filters.heroTimeInterval}
          gameMode={filters.gameMode}
          onStatChange={(value) => filters.setHeroStat(value)}
          onIntervalChange={(value) => filters.setHeroTimeInterval(value as typeof filters.heroTimeInterval)}
        />
      );
    case "stats-by-duration":
      return (
        <HeroStatSelector
          label="Metric"
          value={statWithoutRates(filters)}
          onChange={(val) => filters.setHeroStat(val)}
          options={heroStatsFor(HERO_STATS, filters.gameMode)}
        />
      );
    case "stats-by-rank":
      return MODE_CONFIG[filters.mode].hasRankedMatches ? (
        <>
          <HeroStatSelector
            label="X Axis"
            value={filters.byRankX}
            onChange={(val) => filters.setByRankX(val)}
            options={heroStatsFor(BY_RANK_STATS, filters.gameMode)}
          />
          <HeroStatSelector
            label="Y Axis"
            value={filters.byRankY}
            onChange={(val) => filters.setByRankY(val)}
            options={heroStatsFor(BY_RANK_STATS, filters.gameMode)}
          />
        </>
      ) : null;
    case "stats-by-experience":
      return (
        <HeroStatSelector
          label="Stat"
          value={statWithoutRates(filters)}
          onChange={(val) => filters.setHeroStat(val)}
          options={heroStatsFor(HERO_STATS, filters.gameMode)}
        />
      );
    case "matchups":
      return <HeroLaneFilter value={filters.sameLaneFilter} onValueChange={(v) => void filters.setSameLaneFilter(v)} />;
    case "hero-combs":
      return <HeroCombFilters gameMode={filters.gameMode} />;
    case "hero-matchup-details":
      return (
        <>
          <HeroSelector
            size="sm"
            value={filters.heroId}
            defaultValue={filters.heroId}
            onValueChange={(id) => {
              if (id != null) void filters.setHeroId(id);
            }}
          />
          <HeroLaneFilter value={filters.sameLaneFilter} onValueChange={(v) => void filters.setSameLaneFilter(v)} />
        </>
      );
    case "hero-scoreboard":
      return <ScoreboardControls filters={filters} />;
    default:
      return null;
  }
}

/**
 * A lazily loaded tab body: a chunk that fails to load offers a retry. The route loader preloads the requested view
 * (`preloadHeroView`) on the server and before a tab click lands, so a rendered tab never falls back to the spinner.
 */
function LazyTab({ children }: { children: React.ReactNode }) {
  return (
    <ChunkErrorBoundary>
      <Suspense fallback={<LoadingState />}>{children}</Suspense>
    </ChunkErrorBoundary>
  );
}

export function HeroOverallStatsTab({ filters }: { filters: HeroFilters }) {
  const [groupByType] = useGroupByType();
  const [heroNameQuery, setHeroNameQuery] = useHeroNameQuery();
  const [minPickRate, setMinPickRate] = useHeroMinPickRate();
  // Half the page's search clicks ask for pick rates: the test variant opens the table on pick rate.
  const sortExperiment = useExperiment("exp-heroes-pickrate-default");
  return (
    <Section titleDisplay="hidden" title="Overall Hero Stats">
      <HeroStatsTable
        groupByType={groupByType}
        nameQuery={heroNameQuery}
        onClearNameQuery={() => void setHeroNameQuery(null)}
        onNameQueryChange={(query) => void setHeroNameQuery(query || null)}
        minPickRate={minPickRate}
        onMinPickRateChange={(percent) => startTransition(() => void setMinPickRate(percent > 0 ? percent : null))}
        minRankId={filters.effectiveMinRankId}
        maxRankId={filters.effectiveMaxRankId}
        minHeroMatches={filters.minHeroMatches}
        minHeroMatchesTotal={filters.minHeroMatchesTotal}
        minDate={filters.startDate || undefined}
        maxDate={filters.endDate || undefined}
        prevMinDate={filters.prevStartDate}
        prevMaxDate={filters.prevEndDate}
        gameMode={filters.gameMode}
        matchMode={filters.matchMode}
        defaultSortKey={sortExperiment === "test" ? "pickRate" : "winrate"}
      />
    </Section>
  );
}

export function HeroTierListTab({ filters }: { filters: HeroFilters }) {
  const [groupByType] = useGroupByType();
  const { shownTierMetric } = useTierMetric(filters);
  return (
    <Section titleDisplay="hidden" title="Hero Tier List">
      <LazyTab>
        <HeroTierList
          groupByType={groupByType}
          metric={shownTierMetric}
          minRankId={filters.effectiveMinRankId}
          maxRankId={filters.effectiveMaxRankId}
          minHeroMatches={filters.minHeroMatches}
          minHeroMatchesTotal={filters.minHeroMatchesTotal}
          minDate={filters.startDate || undefined}
          maxDate={filters.endDate || undefined}
          gameMode={filters.gameMode}
          matchMode={filters.matchMode}
        />
      </LazyTab>
    </Section>
  );
}

export function HeroOverTimeTab({ filters }: { filters: HeroFilters }) {
  return (
    <Section titleDisplay="hidden" title="Hero Stats Over Time">
      <LazyTab>
        <HeroStatsOverTimeChart
          heroStat={filters.heroStat}
          heroTimeInterval={filters.heroTimeInterval}
          minRankId={filters.effectiveMinRankId}
          maxRankId={filters.effectiveMaxRankId}
          minHeroMatches={filters.minHeroMatches}
          minHeroMatchesTotal={filters.minHeroMatchesTotal}
          minDate={filters.startDate}
          maxDate={filters.endDate}
          gameMode={filters.gameMode}
          matchMode={filters.matchMode}
        />
      </LazyTab>
    </Section>
  );
}

/** Ban and pick rate have no per-duration or per-experience reading; those views show win rate in their place. */
function statWithoutRates(filters: HeroFilters) {
  return filters.heroStat === "ban_rate" || filters.heroStat === "pickrate" ? "winrate" : filters.heroStat;
}

export function HeroByDurationTab({ filters }: { filters: HeroFilters }) {
  const stat = statWithoutRates(filters);
  return (
    <Section titleDisplay="hidden" title="Hero Stats by Game Duration">
      <LazyTab>
        <HeroStatsByDurationChart
          heroStat={stat}
          minRankId={filters.effectiveMinRankId}
          maxRankId={filters.effectiveMaxRankId}
          minHeroMatches={filters.minHeroMatches}
          minHeroMatchesTotal={filters.minHeroMatchesTotal}
          minDate={filters.startDate}
          maxDate={filters.endDate}
          gameMode={filters.gameMode}
          matchMode={filters.matchMode}
        />
      </LazyTab>
    </Section>
  );
}

export function HeroByRankTab({ filters }: { filters: HeroFilters }) {
  const mode = MODE_CONFIG[filters.mode];
  return (
    <Section titleDisplay="hidden" title="Hero Stats by Rank">
      {mode.hasRankedMatches ? (
        <>
          <LazyTab>
            <HeroStatsByRankChart
              minHeroMatches={filters.minHeroMatches}
              minHeroMatchesTotal={filters.minHeroMatchesTotal}
              minDate={filters.startDate}
              maxDate={filters.endDate}
              gameMode={filters.gameMode}
              matchMode={filters.matchMode}
              xStat={filters.byRankX}
              yStat={filters.byRankY}
            />
          </LazyTab>
        </>
      ) : (
        <EmptyState
          title={`Rank breakdown is unavailable for ${mode.label}`}
          description={`${mode.label} matches have no rank. Explore their overall stats or switch to ranked matches to compare ranks.`}
          action={
            <>
              <Button onClick={() => filters.setTab("stats")}>View {mode.label} stats</Button>
              <Button variant="outline" onClick={() => filters.setMode("normal_ranked")}>
                Switch to ranked matches
              </Button>
            </>
          }
        />
      )}
    </Section>
  );
}

export function HeroByExperienceTab({ filters }: { filters: HeroFilters }) {
  const stat = statWithoutRates(filters);
  return (
    <Section titleDisplay="hidden" title="Hero Stats by Experience">
      <LazyTab>
        <HeroStatsByExperienceTable
          heroStat={stat}
          minRankId={filters.effectiveMinRankId}
          maxRankId={filters.effectiveMaxRankId}
          minHeroMatches={filters.minHeroMatches}
          minDate={filters.startDate}
          maxDate={filters.endDate}
          gameMode={filters.gameMode}
          matchMode={filters.matchMode}
        />
      </LazyTab>
    </Section>
  );
}

export function HeroMatchupsTab({ filters }: { filters: HeroFilters }) {
  return (
    <Section titleDisplay="hidden" title="Hero Matchups">
      <LazyTab>
        <HeroMatchupStatsTable
          minRankId={filters.effectiveMinRankId}
          maxRankId={filters.effectiveMaxRankId}
          minDate={filters.startDate || undefined}
          maxDate={filters.endDate || undefined}
          prevMinDate={filters.prevStartDate}
          prevMaxDate={filters.prevEndDate}
          minMatches={filters.minMatches}
          sameLaneFilter={filters.sameLaneFilter}
          gameMode={filters.gameMode}
          matchMode={filters.matchMode}
        />
      </LazyTab>
    </Section>
  );
}

export function HeroCombosTab({ filters }: { filters: HeroFilters }) {
  return (
    <Section titleDisplay="hidden" title="Hero Combos">
      <LazyTab>
        <HeroCombStatsTable
          columns={["winRate", "pickRate", "totalMatches"]}
          minRankId={filters.effectiveMinRankId}
          maxRankId={filters.effectiveMaxRankId}
          minDate={filters.startDate || undefined}
          maxDate={filters.endDate || undefined}
          prevMinDate={filters.prevStartDate}
          prevMaxDate={filters.prevEndDate}
          minMatches={filters.minMatches}
          gameMode={filters.gameMode}
          matchMode={filters.matchMode}
        />
      </LazyTab>
    </Section>
  );
}

export function HeroMatchupDetailsTab({ filters }: { filters: HeroFilters }) {
  return (
    <Section titleDisplay="hidden" title="Hero Matchup Details">
      <LazyTab>
        <HeroMatchupExplorer
          heroId={filters.heroId}
          minRankId={filters.effectiveMinRankId}
          maxRankId={filters.effectiveMaxRankId}
          minDate={filters.startDate || undefined}
          maxDate={filters.endDate || undefined}
          prevMinDate={filters.prevStartDate}
          prevMaxDate={filters.prevEndDate}
          onHeroSelected={(heroId) => {
            void filters.setHeroId(heroId);
          }}
          sameLaneFilter={filters.sameLaneFilter}
          minHeroMatches={filters.minMatches}
          gameMode={filters.gameMode}
          matchMode={filters.matchMode}
        />
      </LazyTab>
    </Section>
  );
}

export function HeroScoreboardTab({ filters }: { filters: HeroFilters }) {
  const { sortBy, setSortBy } = useScoreboardSortBy(filters);
  const [sortDirection, setSortDirection] = useQueryState(
    "scoreboard_sort_dir",
    parseAsStringLiteral(["desc", "asc"] as const).withDefault("desc"),
  );
  const { minUnixTimestamp, maxUnixTimestamp } = useNormalizedTimeRange(filters.startDate, filters.endDate);
  const scoreboardQuery = useQuery(
    heroScoreboardQueryOptions({
      sortBy: sortBy as HeroScoreboardSortByEnum,
      sortDirection,
      gameMode: filters.gameMode,
      matchMode: filters.matchMode,
      minMatches: filters.minMatches,
      minAverageBadge: filters.effectiveMinRankId,
      maxAverageBadge: filters.effectiveMaxRankId,
      minUnixTimestamp: minUnixTimestamp ?? 0,
      maxUnixTimestamp,
    }),
  );
  return (
    <Section titleDisplay="hidden" title="Hero Scoreboard">
      <QueryRenderer
        query={scoreboardQuery}
        loadingFallback={<LoadingState label="hero scoreboard" align="center" />}
        errorFallback={() => (
          <ErrorState
            title="Failed to load scoreboard"
            onRetry={() => void scoreboardQuery.refetch()}
            retrying={scoreboardQuery.isFetching}
          />
        )}
      >
        {(data) => (
          <HeroScoreboardTable
            entries={data}
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSortChange={(next) => {
              void setSortBy(next.sortBy);
              void setSortDirection(next.sortDirection);
            }}
          />
        )}
      </QueryRenderer>
    </Section>
  );
}
