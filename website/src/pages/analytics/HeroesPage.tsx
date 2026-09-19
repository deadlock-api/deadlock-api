import { useQuery } from "@tanstack/react-query";
import type { HeroScoreboardSortByEnum } from "deadlock_api_client";
import { parseAsBoolean, parseAsStringLiteral, useQueryState } from "nuqs";
import { lazy, Suspense, useId, useState } from "react";

import { ChartToolbar } from "~/components/analytics/ChartToolbar";
import { DataPageHeader } from "~/components/analytics/DataPageHeader";
import { ChunkErrorBoundary } from "~/components/ChunkErrorBoundary";
import { HeroFiltersSection } from "~/components/heroes-page/HeroFiltersSection";
import { HeroScoreboardTable } from "~/components/heroes-page/HeroScoreboardTable";
import { BY_RANK_STATS, HeroStatSelector } from "~/components/heroes-page/HeroStatSelectors";
import { HeroStatsTable } from "~/components/heroes-page/HeroStatsTable";
import { HeroTrendControls } from "~/components/heroes-page/HeroTrendControls";
import { LoadingLogo } from "~/components/LoadingLogo";
import { ALL_SORT_BY_VALUES } from "~/components/player-scoreboard/sort-options";
import { QueryRenderer } from "~/components/QueryRenderer";
import { ResponsiveTabsList } from "~/components/ResponsiveTabsList";
import { MODE_CONFIG } from "~/components/selectors/ModeSelector";
import { Button } from "~/components/ui/button";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from "~/components/ui/empty";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Switch } from "~/components/ui/switch";
import { Tabs, TabsContent } from "~/components/ui/tabs";
import { type HeroTab, useHeroFilters } from "~/hooks/useHeroFilters";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { heroScoreboardQueryOptions } from "~/queries/hero-scoreboard-query";
import { HERO_STATS } from "~/types/api_hero_stats";

const HeroStatsOverTimeChart = lazy(() =>
  import("~/components/heroes-page/HeroStatsOverTimeChart").then((m) => ({
    default: m.HeroStatsOverTimeChart,
  })),
);
const HeroStatsByDurationChart = lazy(() =>
  import("~/components/heroes-page/HeroStatsByDurationChart").then((m) => ({
    default: m.HeroStatsByDurationChart,
  })),
);
const HeroStatsByRankChart = lazy(() =>
  import("~/components/heroes-page/HeroStatsByRankChart").then((m) => ({
    default: m.HeroStatsByRankChart,
  })),
);
const HeroStatsByExperienceTable = lazy(() =>
  import("~/components/heroes-page/HeroStatsByExperienceTable").then((m) => ({
    default: m.HeroStatsByExperienceTable,
  })),
);
const HeroMatchupStatsTable = lazy(() =>
  import("~/components/heroes-page/HeroMatchupStatsTable").then((m) => ({
    default: m.HeroMatchupStatsTable,
  })),
);
const HeroCombStatsTable = lazy(() =>
  import("~/components/heroes-page/HeroCombStatsTable").then((m) => ({
    default: m.HeroCombStatsTable,
  })),
);
const HeroMatchupExplorer = lazy(() =>
  import("~/components/heroes-page/HeroMatchupExplorer").then((m) => ({
    default: m.HeroMatchupExplorer,
  })),
);

export function HeroesPage() {
  const filters = useHeroFilters();
  const [groupByType, setGroupByType] = useQueryState("group_by_type", parseAsBoolean.withDefault(false));
  const groupByTypeId = useId();
  const [heroNameQuery, setHeroNameQuery] = useState("");

  const [scoreboardSortBy, setScoreboardSortBy] = useQueryState(
    "scoreboard_sort_by",
    parseAsStringLiteral(ALL_SORT_BY_VALUES as [string, ...string[]]).withDefault("winrate"),
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

  return (
    <div className="flex flex-col gap-3">
      <DataPageHeader
        title={
          filters.tab === "hero-matchup-details"
            ? "Hero matchup explorer"
            : filters.tab === "stats-over-time"
              ? "Hero performance over time"
              : "Deadlock Hero Win Rates"
        }
        description={
          filters.tab === "hero-matchup-details"
            ? "Discover the allies and opponents that change your game."
            : filters.tab === "stats-over-time"
              ? "Compare hero trends across ranks, patches, and game modes."
              : "Compare hero performance across ranks, patches, and game modes."
        }
      />

      <HeroFiltersSection {...filters} />

      <Tabs
        value={filters.tab ?? undefined}
        onValueChange={(value) => filters.setTab(value as HeroTab)}
        className="tabs-nav w-full"
      >
        <ResponsiveTabsList
          ariaLabel="Hero stats sections"
          value={filters.tab ?? undefined}
          onValueChange={(value) => filters.setTab(value as HeroTab)}
          options={[
            { value: "stats", label: "Overall Stats" },
            { value: "stats-over-time", label: "Over Time" },
            { value: "stats-by-duration", label: "By Duration" },
            { value: "stats-by-rank", label: "By Rank" },
            { value: "stats-by-experience", label: "By Experience" },
            { value: "hero-combs", label: "Combos" },
            { value: "matchups", label: "Matchups" },
            { value: "hero-matchup-details", label: "Matchup Details" },
            { value: "hero-scoreboard", label: "Scoreboard" },
          ]}
        />

        <TabsContent value="stats">
          <div className="flex flex-col gap-4">
            <h2 className="sr-only">Overall Hero Stats</h2>
            <div className="flex flex-wrap items-center gap-3">
              <Input
                type="search"
                value={heroNameQuery}
                onChange={(e) => setHeroNameQuery(e.target.value)}
                placeholder="Find a hero…"
                aria-label="Filter heroes by name"
                className="h-9 w-full sm:w-60"
              />
              {heroNameQuery && (
                <Button variant="ghost" size="sm" onClick={() => setHeroNameQuery("")}>
                  Clear search
                </Button>
              )}
              <div className="flex items-center gap-2 sm:ml-auto">
                <Label htmlFor={groupByTypeId} className="text-sm font-semibold text-nowrap text-foreground">
                  Group by Type
                </Label>
                <Switch
                  id={groupByTypeId}
                  checked={groupByType}
                  onCheckedChange={(checked) => setGroupByType(checked)}
                />
              </div>
            </div>
            <HeroStatsTable
              columns={["winRate", "pickRate", "zScore", "residual", "details"]}
              groupByType={groupByType}
              nameQuery={heroNameQuery}
              onClearNameQuery={() => setHeroNameQuery("")}
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
          </div>
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
              <Suspense fallback={<LoadingLogo />}>
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
          <div className="flex flex-col gap-4">
            <h2 className="sr-only">Hero Stats by Game Duration</h2>
            <ChartToolbar title="Duration comparison">
              <div className="flex w-full items-center gap-2 sm:w-auto">
                <span className="shrink-0 text-xs text-muted-foreground">Metric</span>
                <HeroStatSelector
                  label="Stat"
                  value={filters.heroStat === "ban_rate" ? "winrate" : filters.heroStat}
                  onChange={(val) => filters.setHeroStat(val as typeof filters.heroStat)}
                  options={HERO_STATS}
                />
              </div>
            </ChartToolbar>
            <ChunkErrorBoundary>
              <Suspense fallback={<LoadingLogo />}>
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
          </div>
        </TabsContent>

        <TabsContent value="stats-by-rank">
          <div className="flex flex-col gap-4">
            <h2 className="sr-only">Hero Stats by Rank</h2>
            {MODE_CONFIG[filters.mode].supportsRank ? (
              <>
                <ChartToolbar title="Rank comparison">
                  <div className="flex w-full items-center gap-2 sm:w-auto">
                    <span className="shrink-0 text-xs text-muted-foreground">X Axis</span>
                    <HeroStatSelector
                      label="X Axis"
                      value={filters.byRankX}
                      onChange={(val) => filters.setByRankX(val)}
                      options={BY_RANK_STATS}
                    />
                  </div>
                  <div className="flex w-full items-center gap-2 sm:w-auto">
                    <span className="shrink-0 text-xs text-muted-foreground">Y Axis</span>
                    <HeroStatSelector
                      label="Y Axis"
                      value={filters.byRankY}
                      onChange={(val) => filters.setByRankY(val)}
                      options={BY_RANK_STATS}
                    />
                  </div>
                </ChartToolbar>
                <ChunkErrorBoundary>
                  <Suspense fallback={<LoadingLogo />}>
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
              <Empty className="border">
                <EmptyHeader>
                  <EmptyTitle>Rank breakdown is unavailable for Brawl</EmptyTitle>
                  <EmptyDescription>
                    Brawl does not use ranks. Explore its overall stats or switch to a normal game mode to compare
                    ranks.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button onClick={() => filters.setTab("stats")}>View Brawl stats</Button>
                  <Button variant="outline" onClick={() => filters.setMode("normal_all")}>
                    Switch to normal mode
                  </Button>
                </EmptyContent>
              </Empty>
            )}
          </div>
        </TabsContent>

        <TabsContent value="stats-by-experience">
          <div className="flex flex-col gap-4">
            <h2 className="sr-only">Hero Stats by Experience</h2>
            <div className="flex flex-wrap justify-center gap-2 sm:flex-nowrap">
              <div className="flex flex-col gap-1.5">
                <span className="text-sm text-muted-foreground">Stat</span>
                <HeroStatSelector
                  label="Stat"
                  value={filters.heroStat === "ban_rate" ? "winrate" : filters.heroStat}
                  onChange={(val) => filters.setHeroStat(val as typeof filters.heroStat)}
                  options={HERO_STATS}
                />
              </div>
            </div>
            <ChunkErrorBoundary>
              <Suspense fallback={<LoadingLogo />}>
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
          </div>
        </TabsContent>

        <TabsContent value="matchups">
          <div className="mt-4 flex flex-col gap-4">
            <h2 className="sr-only">Hero Matchups</h2>
            <div className="flex flex-col gap-4">
              <ChunkErrorBoundary>
                <Suspense fallback={<LoadingLogo />}>
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
            </div>
          </div>
        </TabsContent>

        <TabsContent value="hero-combs">
          <div className="flex flex-col gap-4">
            <h2 className="sr-only">Hero Combos</h2>
            <ChunkErrorBoundary>
              <Suspense fallback={<LoadingLogo />}>
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
          </div>
        </TabsContent>

        <TabsContent value="hero-matchup-details">
          <div className="flex flex-col gap-4">
            <h2 className="sr-only">Hero Matchup Details</h2>
            <ChunkErrorBoundary>
              <Suspense fallback={<LoadingLogo />}>
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
          </div>
        </TabsContent>

        <TabsContent value="hero-scoreboard">
          <div className="flex flex-col gap-4">
            <h2 className="sr-only">Hero Scoreboard</h2>
            <QueryRenderer
              query={heroScoreboardQuery}
              loadingFallback={
                <div className="flex items-center justify-center py-24">
                  <LoadingLogo />
                </div>
              }
              errorFallback={(error) => (
                <div className="py-8 text-center text-sm text-destructive">
                  Failed to load scoreboard: {error.message}
                </div>
              )}
            >
              {(data) => (
                <HeroScoreboardTable
                  entries={data}
                  sortBy={scoreboardSortBy}
                  sortDirection={scoreboardSortDirection}
                  onSortByChange={setScoreboardSortBy}
                  onSortDirectionChange={setScoreboardSortDirection}
                />
              )}
            </QueryRenderer>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
