import { useQuery } from "@tanstack/react-query";
import type { HeroScoreboardSortByEnum } from "deadlock_api_client";
import { ChartNoAxesCombined, GraduationCap, Table2 } from "lucide-react";
import { parseAsBoolean, parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { lazy, Suspense, useId } from "react";

import { HERO_SORT_BY_VALUES } from "~/components/domain/player-scoreboard/sort-options";
import { HeroFiltersSection } from "~/components/features/heroes/HeroFiltersSection";
import { HeroScoreboardTable } from "~/components/features/heroes/HeroScoreboardTable";
import { HeroStatSelector } from "~/components/features/heroes/HeroStatSelectors";
import { HeroStatsTable } from "~/components/features/heroes/HeroStatsTable";
import { HeroTrendControls } from "~/components/features/heroes/HeroTrendControls";
import { FilterBar } from "~/components/patterns/filter-bar/FilterBar";
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
import { ANALYTICS_VIEWS } from "~/lib/analytics-tabs";
import { MODE_CONFIG } from "~/lib/game-mode";
import { heroScoreboardQueryOptions } from "~/queries/hero-scoreboard-query";
import { BY_RANK_STATS } from "~/types/api_hero_stats";
import { HERO_STATS } from "~/types/api_hero_stats";

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
const HeroMatchupExplorer = lazy(() =>
  import("~/components/features/heroes/HeroMatchupExplorer").then((m) => ({
    default: m.HeroMatchupExplorer,
  })),
);

export function HeroesPage() {
  const filters = useHeroFilters();
  const [groupByType, setGroupByType] = useQueryState("group_by_type", parseAsBoolean.withDefault(false));
  const groupByTypeId = useId();
  // In the URL like the table's other controls; replace, so each keystroke is not a history entry.
  const [heroNameQuery, setHeroNameQuery] = useQueryState(
    "hero_q",
    parseAsString.withDefault("").withOptions({ history: "replace" }),
  );

  const [scoreboardSortBy, setScoreboardSortBy] = useQueryState(
    "scoreboard_sort_by",
    // Heroes only: a link or a stale URL with a player-only sort (rank) falls back to the default instead of a 400.
    parseAsStringLiteral(HERO_SORT_BY_VALUES as [string, ...string[]]).withDefault("winrate"),
  );
  const [scoreboardSortDirection, setScoreboardSortDirection] = useQueryState(
    "scoreboard_sort_dir",
    parseAsStringLiteral(["desc", "asc"] as const).withDefault("desc"),
  );
  const { minUnixTimestamp: scoreboardMinUnixTimestamp, maxUnixTimestamp: scoreboardMaxUnixTimestamp } =
    useNormalizedTimeRange(filters.startDate, filters.endDate);
  const heroScoreboardQuery = useQuery({
    ...heroScoreboardQueryOptions({
      sortBy: scoreboardSortBy as HeroScoreboardSortByEnum,
      sortDirection: scoreboardSortDirection as "desc" | "asc",
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
          <ResponsiveTab value="stats">Overall Stats</ResponsiveTab>
          <ResponsiveTab value="stats-over-time">Over Time</ResponsiveTab>
          <ResponsiveTab value="stats-by-duration">By Duration</ResponsiveTab>
          <ResponsiveTab value="stats-by-rank">By Rank</ResponsiveTab>
          <ResponsiveTab value="stats-by-experience">By Experience</ResponsiveTab>
          <ResponsiveTab value="hero-combs">Combos</ResponsiveTab>
          <ResponsiveTab value="matchups">Matchups</ResponsiveTab>
          <ResponsiveTab value="hero-matchup-details">Matchup Details</ResponsiveTab>
          <ResponsiveTab value="hero-scoreboard">Scoreboard</ResponsiveTab>
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
              columns={["winRate", "pickRate", "zScore", "residual", "details"]}
              groupByType={groupByType}
              nameQuery={heroNameQuery}
              onClearNameQuery={() => void setHeroNameQuery(null)}
              showMatchCounts
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

        <TabsContent value="stats-over-time">
          <div className="flex flex-col gap-3">
            <HeroTrendControls
              stat={filters.heroStat}
              interval={filters.heroTimeInterval}
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
          </div>
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
                  onChange={(val) => filters.setHeroStat(val as typeof filters.heroStat)}
                  options={HERO_STATS}
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
                      options={BY_RANK_STATS}
                    />
                  </Field>
                  <Field label="Y Axis" orientation="horizontal" className="w-full sm:w-auto">
                    <HeroStatSelector
                      label="Y Axis"
                      value={filters.byRankY}
                      onChange={(val) => filters.setByRankY(val)}
                      options={BY_RANK_STATS}
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
                title="Rank breakdown is unavailable for Brawl"
                description="Brawl does not use ranks. Explore its overall stats or switch to a normal game mode to compare ranks."
                action={
                  <>
                    <Button onClick={() => filters.setTab("stats")}>View Brawl stats</Button>
                    <Button variant="outline" onClick={() => filters.setMode("normal_all")}>
                      Switch to normal mode
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
                  onChange={(val) => filters.setHeroStat(val as typeof filters.heroStat)}
                  options={HERO_STATS}
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
