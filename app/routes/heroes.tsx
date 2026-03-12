import { useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useCallback, useId, useMemo } from "react";
import type { MetaFunction } from "react-router";

import { HeroFiltersSection } from "~/components/heroes-page/HeroFiltersSection";
import { BY_RANK_STATS, HeroStatSelector, HeroTimeIntervalSelector } from "~/components/heroes-page/HeroStatSelectors";
import { HeroStatsTable } from "~/components/heroes-page/HeroStatsTable";
import { LoadingLogo } from "~/components/LoadingLogo";
import { ResponsiveTabsList } from "~/components/ResponsiveTabsList";
import { HeroSelector } from "~/components/selectors/HeroSelector";
import { CACHE_DURATIONS } from "~/constants/cache";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import { Tabs, TabsContent } from "~/components/ui/tabs";
import { type HeroTab, useHeroFilters } from "~/hooks/useHeroFilters";
import { api } from "~/lib/api";
import { createPageMeta } from "~/lib/meta";
import { queryKeys } from "~/queries/query-keys";

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
  const queryClient = useQueryClient();

  const minDateTimestamp = useMemo(() => filters.startDate?.unix() ?? 0, [filters.startDate]);
  const maxDateTimestamp = useMemo(() => filters.endDate?.unix(), [filters.endDate]);

  const handleTabHover = useCallback(
    (tab: string) => {
      const staleTime = CACHE_DURATIONS.ONE_DAY;

      switch (tab) {
        case "stats-over-time":
          import("~/components/heroes-page/HeroStatsOverTimeChart");
          queryClient.prefetchQuery({
            queryKey: queryKeys.analytics.heroStatsOverTime(
              filters.effectiveMinRankId,
              filters.effectiveMaxRankId,
              minDateTimestamp,
              maxDateTimestamp,
              filters.heroTimeInterval,
              filters.minHeroMatches,
              filters.minHeroMatchesTotal,
              filters.gameMode,
            ),
            queryFn: () =>
              api.analytics_api
                .heroStats({
                  minHeroMatches: filters.minHeroMatches,
                  minHeroMatchesTotal: filters.minHeroMatchesTotal,
                  minAverageBadge: filters.effectiveMinRankId ?? 0,
                  maxAverageBadge: filters.effectiveMaxRankId ?? 116,
                  minUnixTimestamp: minDateTimestamp,
                  maxUnixTimestamp: maxDateTimestamp,
                  bucket: filters.heroTimeInterval,
                  gameMode: filters.gameMode,
                })
                .then((r) => r.data),
            staleTime,
          });
          break;
        case "stats-by-duration":
          import("~/components/heroes-page/HeroStatsByDurationChart");
          break;
        case "stats-by-rank":
          import("~/components/heroes-page/HeroStatsByRankChart");
          queryClient.prefetchQuery({
            queryKey: queryKeys.analytics.heroStatsByRank(
              minDateTimestamp,
              maxDateTimestamp,
              filters.minHeroMatches,
              filters.minHeroMatchesTotal,
              "normal",
            ),
            queryFn: () =>
              api.analytics_api
                .heroStats({
                  minHeroMatches: filters.minHeroMatches,
                  minHeroMatchesTotal: filters.minHeroMatchesTotal,
                  minUnixTimestamp: minDateTimestamp,
                  maxUnixTimestamp: maxDateTimestamp,
                  bucket: "avg_badge",
                  gameMode: "normal",
                })
                .then((r) => r.data),
            staleTime,
          });
          break;
        case "stats-by-experience":
          import("~/components/heroes-page/HeroStatsByExperienceTable");
          break;
        case "matchups":
          import("~/components/heroes-page/HeroMatchupStatsTable");
          queryClient.prefetchQuery({
            queryKey: queryKeys.analytics.heroSynergyStats(
              filters.effectiveMinRankId,
              filters.effectiveMaxRankId,
              minDateTimestamp,
              maxDateTimestamp,
              filters.sameLaneFilter,
              filters.samePartyFilter,
              filters.minMatches,
              filters.gameMode,
            ),
            queryFn: () =>
              api.analytics_api
                .heroSynergiesStats({
                  sameLaneFilter: filters.sameLaneFilter,
                  samePartyFilter: filters.samePartyFilter,
                  minMatches: filters.minMatches ?? 0,
                  minAverageBadge: filters.effectiveMinRankId ?? 0,
                  maxAverageBadge: filters.effectiveMaxRankId ?? 116,
                  minUnixTimestamp: minDateTimestamp,
                  maxUnixTimestamp: maxDateTimestamp,
                  gameMode: filters.gameMode,
                })
                .then((r) => r.data),
            staleTime,
          });
          break;
        case "hero-combs":
          import("~/components/heroes-page/HeroCombStatsTable");
          queryClient.prefetchQuery({
            queryKey: queryKeys.analytics.heroCombStats(
              filters.effectiveMinRankId,
              filters.effectiveMaxRankId,
              minDateTimestamp,
              maxDateTimestamp,
              2,
              filters.minMatches,
              filters.gameMode,
            ),
            queryFn: () =>
              api.analytics_api
                .heroCombStats({
                  combSize: 2,
                  minMatches: filters.minMatches ?? 0,
                  minAverageBadge: filters.effectiveMinRankId ?? 0,
                  maxAverageBadge: filters.effectiveMaxRankId ?? 116,
                  minUnixTimestamp: minDateTimestamp,
                  maxUnixTimestamp: maxDateTimestamp,
                  gameMode: filters.gameMode,
                })
                .then((r) => r.data),
            staleTime,
          });
          break;
        case "hero-matchup-details":
          import("~/components/heroes-page/HeroMatchupDetailsStatsTable");
          queryClient.prefetchQuery({
            queryKey: queryKeys.analytics.heroStats(
              filters.effectiveMinRankId,
              filters.effectiveMaxRankId,
              minDateTimestamp,
              maxDateTimestamp,
              filters.minMatches,
              undefined,
              filters.gameMode,
            ),
            queryFn: () =>
              api.analytics_api
                .heroStats({
                  minHeroMatches: filters.minMatches ?? 0,
                  minAverageBadge: filters.effectiveMinRankId ?? 0,
                  maxAverageBadge: filters.effectiveMaxRankId ?? 116,
                  minUnixTimestamp: minDateTimestamp,
                  maxUnixTimestamp: maxDateTimestamp,
                  gameMode: filters.gameMode,
                })
                .then((r) => r.data),
            staleTime,
          });
          break;
      }
    },
    [
      queryClient,
      minDateTimestamp,
      maxDateTimestamp,
      filters.effectiveMinRankId,
      filters.effectiveMaxRankId,
      filters.heroTimeInterval,
      filters.minHeroMatches,
      filters.minHeroMatchesTotal,
      filters.minMatches,
      filters.sameLaneFilter,
      filters.samePartyFilter,
      filters.gameMode,
    ],
  );

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
          onTabHover={handleTabHover}
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
            </div>
          </div>
        </TabsContent>

        <TabsContent value="hero-combs">
          <div className="flex flex-col gap-4">
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
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
