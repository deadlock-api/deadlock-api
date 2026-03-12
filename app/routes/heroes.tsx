import { lazy, Suspense, useId } from "react";
import type { MetaFunction } from "react-router";

import { ChunkErrorBoundary } from "~/components/ChunkErrorBoundary";
import { HeroFiltersSection } from "~/components/heroes-page/HeroFiltersSection";
import { BY_RANK_STATS, HeroStatSelector, HeroTimeIntervalSelector } from "~/components/heroes-page/HeroStatSelectors";
import { HeroStatsTable } from "~/components/heroes-page/HeroStatsTable";
import { LoadingLogo } from "~/components/LoadingLogo";
import { ResponsiveTabsList } from "~/components/ResponsiveTabsList";
import { HeroSelector } from "~/components/selectors/HeroSelector";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import { Tabs, TabsContent } from "~/components/ui/tabs";
import { type HeroTab, useHeroFilters } from "~/hooks/useHeroFilters";
import { createPageMeta } from "~/lib/meta";

const HeroStatsOverTimeChart = lazy(() =>
  import("~/components/heroes-page/HeroStatsOverTimeChart").then((m) => ({ default: m.HeroStatsOverTimeChart })),
);
const HeroStatsByDurationChart = lazy(() =>
  import("~/components/heroes-page/HeroStatsByDurationChart").then((m) => ({ default: m.HeroStatsByDurationChart })),
);
const HeroStatsByRankChart = lazy(() =>
  import("~/components/heroes-page/HeroStatsByRankChart").then((m) => ({ default: m.HeroStatsByRankChart })),
);
const HeroStatsByExperienceTable = lazy(() =>
  import("~/components/heroes-page/HeroStatsByExperienceTable").then((m) => ({
    default: m.HeroStatsByExperienceTable,
  })),
);
const HeroMatchupStatsTable = lazy(() =>
  import("~/components/heroes-page/HeroMatchupStatsTable").then((m) => ({ default: m.HeroMatchupStatsTable })),
);
const HeroCombStatsTable = lazy(() =>
  import("~/components/heroes-page/HeroCombStatsTable").then((m) => ({ default: m.HeroCombStatsTable })),
);
const HeroMatchupDetailsStatsTable = lazy(() =>
  import("~/components/heroes-page/HeroMatchupDetailsStatsTable").then((m) => ({
    default: m.HeroMatchupDetailsStatsTable,
  })),
);

export const meta: MetaFunction = () => {
  return createPageMeta({
    title: "Hero Stats & Analytics | Deadlock API",
    description: "View win rates, pick rates, matchups, and performance analytics for all Deadlock heroes.",
    path: "/heroes",
  });
};
export default function Heroes(
  { initialTab }: { initialTab?: HeroTab } = {
    initialTab: "stats",
  },
) {
  const filters = useHeroFilters(initialTab);
  const sameLaneFilterId1 = useId();
  const samePartyFilterId1 = useId();
  const sameLaneFilterId2 = useId();
  const samePartyFilterId2 = useId();

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Hero Stats</h1>
        <p className="mt-1 text-sm text-muted-foreground">Detailed analytics and matchup data for Deadlock heroes</p>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Explore win rates, pick rates, and matchup data for every Deadlock hero. Filter by rank, patch, and game mode
          to find the strongest heroes in the current meta or analyze how hero performance changes over time.
        </p>
      </div>

      <HeroFiltersSection {...filters} />

      <Tabs
        value={filters.tab ?? undefined}
        onValueChange={(value) => filters.setTab(value as HeroTab)}
        className="tabs-nav w-full"
      >
        <ResponsiveTabsList
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
          ]}
        />

        <TabsContent value="stats">
          <div className="flex flex-col gap-4">
            <HeroStatsTable
              columns={["winRate", "pickRate", "KDA", "totalMatches"]}
              sortBy="winrate"
              minRankId={filters.effectiveMinRankId}
              maxRankId={filters.effectiveMaxRankId}
              minHeroMatches={filters.minHeroMatches}
              minHeroMatchesTotal={filters.minHeroMatchesTotal}
              minDate={filters.startDate || undefined}
              maxDate={filters.endDate || undefined}
              prevMinDate={filters.prevDates.prevStartDate}
              prevMaxDate={filters.prevDates.prevEndDate}
              gameMode={filters.gameMode}
            />
          </div>
        </TabsContent>

        <TabsContent value="stats-over-time">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap justify-center gap-2 sm:flex-nowrap">
              <div className="flex flex-col gap-1.5">
                <span className="text-sm text-muted-foreground">Stat</span>
                <HeroStatSelector
                  value={filters.heroStat}
                  onChange={(val) => filters.setHeroStat(val as typeof filters.heroStat)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm text-muted-foreground">Time Interval</span>
                <HeroTimeIntervalSelector
                  value={filters.heroTimeInterval ?? undefined}
                  onChange={(val) => filters.setHeroTimeInterval(val as typeof filters.heroTimeInterval)}
                />
              </div>
            </div>
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
                />
              </Suspense>
            </ChunkErrorBoundary>
          </div>
        </TabsContent>

        <TabsContent value="stats-by-duration">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap justify-center gap-2 sm:flex-nowrap">
              <div className="flex flex-col gap-1.5">
                <span className="text-sm text-muted-foreground">Stat</span>
                <HeroStatSelector
                  value={filters.heroStat}
                  onChange={(val) => filters.setHeroStat(val as typeof filters.heroStat)}
                />
              </div>
            </div>
            <ChunkErrorBoundary>
              <Suspense fallback={<LoadingLogo />}>
                <HeroStatsByDurationChart
                  heroStat={filters.heroStat}
                  minRankId={filters.effectiveMinRankId}
                  maxRankId={filters.effectiveMaxRankId}
                  minHeroMatches={filters.minHeroMatches}
                  minHeroMatchesTotal={filters.minHeroMatchesTotal}
                  minDate={filters.startDate}
                  maxDate={filters.endDate}
                  gameMode={filters.gameMode}
                />
              </Suspense>
            </ChunkErrorBoundary>
          </div>
        </TabsContent>

        <TabsContent value="stats-by-rank">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col items-center gap-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-sm text-muted-foreground">X Axis</span>
                <HeroStatSelector
                  value={filters.byRankX}
                  onChange={(val) => filters.setByRankX(val)}
                  options={BY_RANK_STATS}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm text-muted-foreground">Y Axis</span>
                <HeroStatSelector
                  value={filters.byRankY}
                  onChange={(val) => filters.setByRankY(val)}
                  options={BY_RANK_STATS}
                />
              </div>
            </div>
            <ChunkErrorBoundary>
              <Suspense fallback={<LoadingLogo />}>
                <HeroStatsByRankChart
                  minHeroMatches={filters.minHeroMatches}
                  minHeroMatchesTotal={filters.minHeroMatchesTotal}
                  minDate={filters.startDate}
                  maxDate={filters.endDate}
                  gameMode={"normal"}
                  xStat={filters.byRankX}
                  yStat={filters.byRankY}
                />
              </Suspense>
            </ChunkErrorBoundary>
          </div>
        </TabsContent>

        <TabsContent value="stats-by-experience">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap justify-center gap-2 sm:flex-nowrap">
              <div className="flex flex-col gap-1.5">
                <span className="text-sm text-muted-foreground">Stat</span>
                <HeroStatSelector
                  value={filters.heroStat}
                  onChange={(val) => filters.setHeroStat(val as typeof filters.heroStat)}
                />
              </div>
            </div>
            <ChunkErrorBoundary>
              <Suspense fallback={<LoadingLogo />}>
                <HeroStatsByExperienceTable
                  heroStat={filters.heroStat}
                  minRankId={filters.effectiveMinRankId}
                  maxRankId={filters.effectiveMaxRankId}
                  minHeroMatches={filters.minHeroMatches}
                  minDate={filters.startDate}
                  maxDate={filters.endDate}
                  gameMode={filters.gameMode}
                />
              </Suspense>
            </ChunkErrorBoundary>
          </div>
        </TabsContent>

        <TabsContent value="matchups">
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-center gap-8 sm:flex-nowrap">
              <div className="flex items-center gap-2">
                <Label htmlFor={sameLaneFilterId1} className="text-sm font-semibold text-nowrap text-foreground">
                  Same Lane Filter
                </Label>
                <Checkbox
                  id={sameLaneFilterId1}
                  checked={filters.sameLaneFilter}
                  onCheckedChange={(i) => filters.setSameLaneFilter(i === true)}
                />
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor={samePartyFilterId1} className="text-sm font-semibold text-nowrap text-foreground">
                  Same Party Filter
                </Label>
                <Checkbox
                  id={samePartyFilterId1}
                  checked={filters.samePartyFilter}
                  onCheckedChange={(i) => filters.setSamePartyFilter(i === true)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <ChunkErrorBoundary>
                <Suspense fallback={<LoadingLogo />}>
                  <HeroMatchupStatsTable
                    minRankId={filters.effectiveMinRankId}
                    maxRankId={filters.effectiveMaxRankId}
                    minDate={filters.startDate || undefined}
                    maxDate={filters.endDate || undefined}
                    prevMinDate={filters.prevDates.prevStartDate}
                    prevMaxDate={filters.prevDates.prevEndDate}
                    minMatches={filters.minMatches}
                    sameLaneFilter={filters.sameLaneFilter}
                    samePartyFilter={filters.samePartyFilter}
                    gameMode={filters.gameMode}
                  />
                </Suspense>
              </ChunkErrorBoundary>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="hero-combs">
          <div className="flex flex-col gap-4">
            <ChunkErrorBoundary>
              <Suspense fallback={<LoadingLogo />}>
                <HeroCombStatsTable
                  columns={["winRate", "pickRate", "totalMatches"]}
                  minRankId={filters.effectiveMinRankId}
                  maxRankId={filters.effectiveMaxRankId}
                  minDate={filters.startDate || undefined}
                  maxDate={filters.endDate || undefined}
                  prevMinDate={filters.prevDates.prevStartDate}
                  prevMaxDate={filters.prevDates.prevEndDate}
                  minMatches={filters.minMatches}
                  gameMode={filters.gameMode}
                />
              </Suspense>
            </ChunkErrorBoundary>
          </div>
        </TabsContent>

        <TabsContent value="hero-matchup-details">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-center gap-8 sm:flex-nowrap">
              <HeroSelector
                selectedHero={filters.heroId}
                onHeroSelected={(selectedHeroId) => {
                  if (!selectedHeroId) return;
                  filters.setHeroId(selectedHeroId);
                }}
              />
              <div className="flex flex-col flex-wrap items-center gap-2 sm:flex-nowrap">
                <div className="flex items-center gap-2">
                  <Label htmlFor={sameLaneFilterId2} className="text-sm font-semibold text-nowrap text-foreground">
                    Same Lane Filter
                  </Label>
                  <Checkbox
                    id={sameLaneFilterId2}
                    checked={filters.sameLaneFilter}
                    onCheckedChange={(i) => filters.setSameLaneFilter(i === true)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor={samePartyFilterId2} className="text-sm font-semibold text-nowrap text-foreground">
                    Same Party Filter
                  </Label>
                  <Checkbox
                    id={samePartyFilterId2}
                    checked={filters.samePartyFilter}
                    onCheckedChange={(i) => filters.setSamePartyFilter(i === true)}
                  />
                </div>
              </div>
            </div>
            <ChunkErrorBoundary>
              <Suspense fallback={<LoadingLogo />}>
                <div className="grid grid-cols-2 gap-4">
                  <HeroMatchupDetailsStatsTable
                    heroId={filters.heroId}
                    stat={0}
                    minRankId={filters.effectiveMinRankId}
                    maxRankId={filters.effectiveMaxRankId}
                    minDate={filters.startDate || undefined}
                    maxDate={filters.endDate || undefined}
                    onHeroSelected={(selectedHeroId) => {
                      if (!selectedHeroId) return;
                      filters.setHeroId(selectedHeroId);
                    }}
                    sameLaneFilter={filters.sameLaneFilter}
                    samePartyFilter={filters.samePartyFilter}
                    minHeroMatches={filters.minMatches}
                    gameMode={filters.gameMode}
                  />
                  <HeroMatchupDetailsStatsTable
                    heroId={filters.heroId}
                    stat={1}
                    minRankId={filters.effectiveMinRankId}
                    maxRankId={filters.effectiveMaxRankId}
                    minDate={filters.startDate || undefined}
                    maxDate={filters.endDate || undefined}
                    onHeroSelected={(selectedHeroId) => {
                      if (!selectedHeroId) return;
                      filters.setHeroId(selectedHeroId);
                    }}
                    sameLaneFilter={filters.sameLaneFilter}
                    samePartyFilter={filters.samePartyFilter}
                    minHeroMatches={filters.minMatches}
                    gameMode={filters.gameMode}
                  />
                </div>
              </Suspense>
            </ChunkErrorBoundary>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
