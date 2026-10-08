import { useQuery } from "@tanstack/react-query";
import type { HeroScoreboardSortByEnum } from "deadlock_api_client";
import { ChartNoAxesCombined, GraduationCap, ListOrdered, Swords, Table2, Trophy, UsersRound } from "lucide-react";
import { parseAsBoolean, parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { lazy, Suspense, useId } from "react";

import { SortBySelector } from "~/components/domain/player-scoreboard/SortBySelector";
import { HeroCombFilters } from "~/components/features/heroes/HeroCombFilters";
import { HeroFiltersSection } from "~/components/features/heroes/HeroFiltersSection";
import { HeroLaneFilter } from "~/components/features/heroes/HeroLaneFilter";
import { HeroScoreboardTable } from "~/components/features/heroes/HeroScoreboardTable";
import { HeroStatSelector } from "~/components/features/heroes/HeroStatSelectors";
import { HeroStatsTable } from "~/components/features/heroes/HeroStatsTable";
import { HeroTrendControls } from "~/components/features/heroes/HeroTrendControls";
import { FilterBar } from "~/components/patterns/filter-bar/FilterBar";
import { StringOption, StringOptionGroup, StringSelector } from "~/components/patterns/filter-bar/StringSelector";
import { ResponsiveTab, ResponsiveTabsList } from "~/components/patterns/navigation/ResponsiveTabsList";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { Section } from "~/components/patterns/page/Section";
import { ChunkErrorBoundary } from "~/components/patterns/states/ChunkErrorBoundary";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { QueryRenderer } from "~/components/patterns/states/QueryRenderer";
import { Button } from "~/components/ui/button";
import { Field } from "~/components/ui/field";
import { SearchInput } from "~/components/ui/search-input";
import { Switch } from "~/components/ui/switch";
import { Tabs, TabsContent } from "~/components/ui/tabs";
import { type HeroTab, useHeroFilters } from "~/hooks/useHeroFilters";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { analyticsTabPath, ANALYTICS_VIEWS } from "~/lib/analytics-tabs";
import { hasSoulEconomy, MODE_CONFIG } from "~/lib/game-mode";
import { TIER_METRIC_DEFINITIONS, TIER_METRICS, type TierMetric, type TierMetricDefinition } from "~/lib/hero-tiers";
import { HERO_SORT_BY_VALUES, sortByIn } from "~/lib/scoreboard-sorts";
import { heroScoreboardQueryOptions } from "~/queries/hero-scoreboard-query";
import { BY_RANK_STATS, HERO_STATS, heroStatsFor } from "~/types/api_hero_stats";

const HeroStatsOverTimeChart = lazy(() =>
  import("~/components/features/heroes/HeroStatsOverTimeChart").then((m) => ({
    default: m.HeroStatsOverTimeChart,
  })),
);
const HeroStatsByDurationChart = lazy(() =>
  import("~/components/features/heroes/HeroStatsByDurationChart").then((m) => ({
    default: m.HeroStatsByDurationChart,
  })),
);
const HeroStatsByRankChart = lazy(() =>
  import("~/components/features/heroes/HeroStatsByRankChart").then((m) => ({
    default: m.HeroStatsByRankChart,
  })),
);
const HeroStatsByExperienceTable = lazy(() =>
  import("~/components/features/heroes/HeroStatsByExperienceTable").then((m) => ({
    default: m.HeroStatsByExperienceTable,
  })),
);
const HeroMatchupStatsTable = lazy(() =>
  import("~/components/features/heroes/HeroMatchupStatsTable").then((m) => ({
    default: m.HeroMatchupStatsTable,
  })),
);
const HeroCombStatsTable = lazy(() =>
  import("~/components/features/heroes/HeroCombStatsTable").then((m) => ({
    default: m.HeroCombStatsTable,
  })),
);
const HeroTierList = lazy(() =>
  import("~/components/features/heroes/HeroTierList").then((m) => ({
    default: m.HeroTierList,
  })),
);
const HeroMatchupExplorer = lazy(() =>
  import("~/components/features/heroes/HeroMatchupExplorer").then((m) => ({
    default: m.HeroMatchupExplorer,
  })),
);

export function HeroesPage() {
  const filters = useHeroFilters();
  const [groupByType, setGroupByType] = useQueryState("group_by_type", parseAsBoolean.withDefault(false));
  const groupByTypeId = useId();
  // The tier list has its own switch for the same setting; an id is unique to one element.
  const tierGroupByTypeId = useId();
  const [tierMetric, setTierMetric] = useQueryState(
    "tier_metric",
    parseAsStringLiteral(TIER_METRICS).withDefault("score"),
  );
  // Street Brawl has neither bans nor a soul economy: those metrics leave the list, and one chosen in another mode
  // falls back to the tier score while the URL keeps it.
  const tierMetrics = TIER_METRICS.filter((metric) => {
    const definition: TierMetricDefinition = TIER_METRIC_DEFINITIONS[metric];
    return hasSoulEconomy(filters.gameMode) || (!definition.bans && !definition.economy);
  });
  const shownTierMetric = tierMetrics.includes(tierMetric) ? tierMetric : "score";
  // In the URL like the table's other controls; replace, so each keystroke is not a history entry.
  const [heroNameQuery, setHeroNameQuery] = useQueryState(
    "hero_q",
    parseAsString.withDefault("").withOptions({ history: "replace" }),
  );

  const [chosenScoreboardSortBy, setScoreboardSortBy] = useQueryState(
    "scoreboard_sort_by",
    // Heroes only: a link or a stale URL with a player-only sort (rank) falls back to the default instead of a 400.
    parseAsStringLiteral(HERO_SORT_BY_VALUES as [string, ...string[]]).withDefault("winrate"),
  );
  // Street Brawl has no soul economy: a net worth sort chosen in another mode falls back, the URL keeps it.
  const scoreboardSortBy = sortByIn(chosenScoreboardSortBy, filters.gameMode, "winrate");
  const [scoreboardSortDirection, setScoreboardSortDirection] = useQueryState(
    "scoreboard_sort_dir",
    parseAsStringLiteral(["desc", "asc"] as const).withDefault("desc"),
  );
  const { minUnixTimestamp: scoreboardMinUnixTimestamp, maxUnixTimestamp: scoreboardMaxUnixTimestamp } =
    useNormalizedTimeRange(filters.startDate, filters.endDate);
  const heroScoreboardQuery = useQuery({
    ...heroScoreboardQueryOptions({
      sortBy: scoreboardSortBy as HeroScoreboardSortByEnum,
      sortDirection: scoreboardSortDirection,
      gameMode: filters.gameMode,
      matchMode: filters.matchMode,
      minMatches: filters.minMatches,
      minAverageBadge: filters.effectiveMinRankId,
      maxAverageBadge: filters.effectiveMaxRankId,
      minUnixTimestamp: scoreboardMinUnixTimestamp ?? 0,
      maxUnixTimestamp: scoreboardMaxUnixTimestamp,
    }),
    enabled: filters.tab === "hero-scoreboard",
  });

  const view = ANALYTICS_VIEWS.heroes[filters.tab];

  return (
    <PageShell>
      <PageHeader title={view.heading} description={view.summary} />

      <HeroFiltersSection {...filters} />

      <Tabs
        value={filters.tab ?? undefined}
        onValueChange={(value) => filters.setTab(value as HeroTab)}
        className="w-full"
      >
        <ResponsiveTabsList
          aria-label="Hero stats sections"
          value={filters.tab ?? undefined}
          onValueChange={(value) => filters.setTab(value as HeroTab)}
        >
          <ResponsiveTab value="stats" href={analyticsTabPath("heroes", "stats")}>
            Overall Stats
          </ResponsiveTab>
          <ResponsiveTab value="tier-list" href={analyticsTabPath("heroes", "tier-list")}>
            Tier List
          </ResponsiveTab>
          <ResponsiveTab value="stats-over-time" href={analyticsTabPath("heroes", "stats-over-time")}>
            Over Time
          </ResponsiveTab>
          <ResponsiveTab value="stats-by-duration" href={analyticsTabPath("heroes", "stats-by-duration")}>
            By Duration
          </ResponsiveTab>
          <ResponsiveTab value="stats-by-rank" href={analyticsTabPath("heroes", "stats-by-rank")}>
            By Rank
          </ResponsiveTab>
          <ResponsiveTab value="stats-by-experience" href={analyticsTabPath("heroes", "stats-by-experience")}>
            By Experience
          </ResponsiveTab>
          <ResponsiveTab value="hero-combs" href={analyticsTabPath("heroes", "hero-combs")}>
            Combos
          </ResponsiveTab>
          <ResponsiveTab value="matchups" href={analyticsTabPath("heroes", "matchups")}>
            Matchups
          </ResponsiveTab>
          <ResponsiveTab value="hero-matchup-details" href={analyticsTabPath("heroes", "hero-matchup-details")}>
            Matchup Details
          </ResponsiveTab>
          <ResponsiveTab value="hero-scoreboard" href={analyticsTabPath("heroes", "hero-scoreboard")}>
            Scoreboard
          </ResponsiveTab>
        </ResponsiveTabsList>

        <TabsContent value="stats">
          <Section titleDisplay="hidden" title="Overall Hero Stats">
            <FilterBar variant="toolbar" title="Overall stats" icon={Table2} aria-label="Hero table controls">
              <SearchInput
                value={heroNameQuery}
                onValueChange={setHeroNameQuery}
                placeholder="Find a hero…"
                aria-label="Filter heroes by name"
                size="sm"
                className="w-full sm:w-60"
              />
              <Field label="Group by Type" orientation="horizontal" htmlFor={groupByTypeId}>
                <Switch
                  id={groupByTypeId}
                  checked={groupByType}
                  onCheckedChange={(checked) => setGroupByType(checked)}
                />
              </Field>
            </FilterBar>
            <HeroStatsTable
              groupByType={groupByType}
              nameQuery={heroNameQuery}
              onClearNameQuery={() => void setHeroNameQuery(null)}
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
            />
          </Section>
        </TabsContent>

        <TabsContent value="tier-list">
          <Section titleDisplay="hidden" title="Hero Tier List">
            <FilterBar variant="toolbar" title="Tier list" icon={ListOrdered} aria-label="Tier list controls">
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
              <Field label="Group by Type" orientation="horizontal" htmlFor={tierGroupByTypeId}>
                <Switch
                  id={tierGroupByTypeId}
                  checked={groupByType}
                  onCheckedChange={(checked) => setGroupByType(checked)}
                />
              </Field>
            </FilterBar>
            <ChunkErrorBoundary>
              <Suspense fallback={<LoadingState />}>
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
              </Suspense>
            </ChunkErrorBoundary>
          </Section>
        </TabsContent>

        <TabsContent value="stats-over-time">
          <Section titleDisplay="hidden" title="Hero Stats Over Time" className="gap-3">
            <HeroTrendControls
              stat={filters.heroStat}
              interval={filters.heroTimeInterval}
              gameMode={filters.gameMode}
              onStatChange={(value) => filters.setHeroStat(value)}
              onIntervalChange={(value) => filters.setHeroTimeInterval(value as typeof filters.heroTimeInterval)}
            />
            <ChunkErrorBoundary>
              <Suspense fallback={<LoadingState />}>
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
              </Suspense>
            </ChunkErrorBoundary>
          </Section>
        </TabsContent>

        <TabsContent value="stats-by-duration">
          <Section titleDisplay="hidden" title="Hero Stats by Game Duration">
            <FilterBar
              variant="toolbar"
              title="Duration comparison"
              icon={ChartNoAxesCombined}
              aria-label="Chart controls"
            >
              <Field label="Metric" orientation="horizontal" className="w-full sm:w-auto">
                <HeroStatSelector
                  label="Stat"
                  value={filters.heroStat === "ban_rate" ? "winrate" : filters.heroStat}
                  onChange={(val) => filters.setHeroStat(val)}
                  options={heroStatsFor(HERO_STATS, filters.gameMode)}
                />
              </Field>
            </FilterBar>
            <ChunkErrorBoundary>
              <Suspense fallback={<LoadingState />}>
                <HeroStatsByDurationChart
                  heroStat={filters.heroStat === "ban_rate" ? "winrate" : filters.heroStat}
                  minRankId={filters.effectiveMinRankId}
                  maxRankId={filters.effectiveMaxRankId}
                  minHeroMatches={filters.minHeroMatches}
                  minHeroMatchesTotal={filters.minHeroMatchesTotal}
                  minDate={filters.startDate}
                  maxDate={filters.endDate}
                  gameMode={filters.gameMode}
                  matchMode={filters.matchMode}
                />
              </Suspense>
            </ChunkErrorBoundary>
          </Section>
        </TabsContent>

        <TabsContent value="stats-by-rank">
          <Section titleDisplay="hidden" title="Hero Stats by Rank">
            {MODE_CONFIG[filters.mode].supportsRank ? (
              <>
                <FilterBar
                  variant="toolbar"
                  title="Rank comparison"
                  icon={ChartNoAxesCombined}
                  aria-label="Chart controls"
                >
                  <Field label="X Axis" orientation="horizontal" className="w-full sm:w-auto">
                    <HeroStatSelector
                      label="X Axis"
                      value={filters.byRankX}
                      onChange={(val) => filters.setByRankX(val)}
                      options={heroStatsFor(BY_RANK_STATS, filters.gameMode)}
                    />
                  </Field>
                  <Field label="Y Axis" orientation="horizontal" className="w-full sm:w-auto">
                    <HeroStatSelector
                      label="Y Axis"
                      value={filters.byRankY}
                      onChange={(val) => filters.setByRankY(val)}
                      options={heroStatsFor(BY_RANK_STATS, filters.gameMode)}
                    />
                  </Field>
                </FilterBar>
                <ChunkErrorBoundary>
                  <Suspense fallback={<LoadingState />}>
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
                  </Suspense>
                </ChunkErrorBoundary>
              </>
            ) : (
              <EmptyState
                title={`Rank breakdown is unavailable for ${MODE_CONFIG[filters.mode].label}`}
                description={`${MODE_CONFIG[filters.mode].label} matches have no rank. Explore their overall stats or switch to all normal matches to compare ranks.`}
                action={
                  <>
                    <Button onClick={() => filters.setTab("stats")}>
                      View {MODE_CONFIG[filters.mode].label} stats
                    </Button>
                    <Button variant="outline" onClick={() => filters.setMode("normal_all")}>
                      Switch to all normal matches
                    </Button>
                  </>
                }
              />
            )}
          </Section>
        </TabsContent>

        <TabsContent value="stats-by-experience">
          <Section titleDisplay="hidden" title="Hero Stats by Experience">
            <FilterBar
              variant="toolbar"
              title="Experience comparison"
              icon={GraduationCap}
              aria-label="Experience table controls"
            >
              <Field label="Stat" orientation="horizontal" className="w-full sm:w-auto">
                <HeroStatSelector
                  label="Stat"
                  value={filters.heroStat === "ban_rate" ? "winrate" : filters.heroStat}
                  onChange={(val) => filters.setHeroStat(val)}
                  options={heroStatsFor(HERO_STATS, filters.gameMode)}
                />
              </Field>
            </FilterBar>
            <ChunkErrorBoundary>
              <Suspense fallback={<LoadingState />}>
                <HeroStatsByExperienceTable
                  heroStat={filters.heroStat === "ban_rate" ? "winrate" : filters.heroStat}
                  minRankId={filters.effectiveMinRankId}
                  maxRankId={filters.effectiveMaxRankId}
                  minHeroMatches={filters.minHeroMatches}
                  minDate={filters.startDate}
                  maxDate={filters.endDate}
                  gameMode={filters.gameMode}
                  matchMode={filters.matchMode}
                />
              </Suspense>
            </ChunkErrorBoundary>
          </Section>
        </TabsContent>

        <TabsContent value="matchups">
          <Section titleDisplay="hidden" title="Hero Matchups">
            <FilterBar variant="toolbar" title="Matchups" icon={Swords} aria-label="Matchup table controls">
              <HeroLaneFilter value={filters.sameLaneFilter} onValueChange={(v) => void filters.setSameLaneFilter(v)} />
            </FilterBar>
            <ChunkErrorBoundary>
              <Suspense fallback={<LoadingState />}>
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
              </Suspense>
            </ChunkErrorBoundary>
          </Section>
        </TabsContent>

        <TabsContent value="hero-combs">
          <Section titleDisplay="hidden" title="Hero Combos">
            <FilterBar variant="toolbar" title="Combinations" icon={UsersRound} aria-label="Combination table controls">
              <HeroCombFilters />
            </FilterBar>
            <ChunkErrorBoundary>
              <Suspense fallback={<LoadingState />}>
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
              </Suspense>
            </ChunkErrorBoundary>
          </Section>
        </TabsContent>

        <TabsContent value="hero-matchup-details">
          <Section titleDisplay="hidden" title="Hero Matchup Details">
            <ChunkErrorBoundary>
              <Suspense fallback={<LoadingState />}>
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
                  onSameLaneFilterChange={(v) => void filters.setSameLaneFilter(v)}
                  minHeroMatches={filters.minMatches}
                  gameMode={filters.gameMode}
                  matchMode={filters.matchMode}
                />
              </Suspense>
            </ChunkErrorBoundary>
          </Section>
        </TabsContent>

        <TabsContent value="hero-scoreboard">
          <Section titleDisplay="hidden" title="Hero Scoreboard">
            <FilterBar variant="toolbar" title="Scoreboard" icon={Trophy} aria-label="Scoreboard controls">
              <SortBySelector
                scope="heroes"
                gameMode={filters.gameMode}
                size="sm"
                value={scoreboardSortBy}
                defaultValue="winrate"
                onValueChange={(value) => void setScoreboardSortBy(value)}
              />
            </FilterBar>
            <QueryRenderer
              query={heroScoreboardQuery}
              loadingFallback={<LoadingState label="hero scoreboard" align="center" />}
              errorFallback={(error) => (
                <ErrorState
                  title="Failed to load scoreboard"
                  description={error.message}
                  onRetry={() => void heroScoreboardQuery.refetch()}
                  retrying={heroScoreboardQuery.isFetching}
                />
              )}
            >
              {(data) => (
                <HeroScoreboardTable
                  entries={data}
                  sortBy={scoreboardSortBy}
                  sortDirection={scoreboardSortDirection}
                  onSortChange={({ sortBy, sortDirection }) => {
                    void setScoreboardSortBy(sortBy);
                    void setScoreboardSortDirection(sortDirection);
                  }}
                />
              )}
            </QueryRenderer>
          </Section>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
