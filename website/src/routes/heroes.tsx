import { createFileRoute } from "@tanstack/react-router";
import { parseAsBoolean, useQueryState } from "nuqs";
import { lazy, Suspense, useId } from "react";

import { ChunkErrorBoundary } from "~/components/ChunkErrorBoundary";
import { HeroFiltersSection } from "~/components/heroes-page/HeroFiltersSection";
import { BY_RANK_STATS, HeroStatSelector, HeroTimeIntervalSelector } from "~/components/heroes-page/HeroStatSelectors";
import { HeroStatsTable } from "~/components/heroes-page/HeroStatsTable";
import { LoadingLogo } from "~/components/LoadingLogo";
import { ResponsiveTabsList } from "~/components/ResponsiveTabsList";
import { HeroSelector } from "~/components/selectors/HeroSelector";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import { Switch } from "~/components/ui/switch";
import { Tabs, TabsContent } from "~/components/ui/tabs";
import { type HeroTab, useHeroFilters } from "~/hooks/useHeroFilters";
import { DEFAULT_DATE_RANGE, DEFAULT_PREV_DATE_RANGE } from "~/lib/constants";
import { prefetchSafe } from "~/lib/prefetch-safe";
import { seo } from "~/lib/seo";
import { normalizeUnixCeil, normalizeUnixFloor } from "~/lib/time-normalize";
import { heroBanStatsQueryOptions } from "~/queries/hero-ban-stats-query";
import { heroStatsQueryOptions } from "~/queries/hero-stats-query";
import { HERO_STATS, HERO_STATS_WITH_BAN_RATE } from "~/types/api_hero_stats";

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
const HeroMatchupDetailsStatsTable = lazy(() =>
  import("~/components/heroes-page/HeroMatchupDetailsStatsTable").then((m) => ({
    default: m.HeroMatchupDetailsStatsTable,
  })),
);

const DEFAULT_MIN_RANK = 91;
const DEFAULT_MAX_RANK = 116;

function defaultHeroStatsRanges() {
  return {
    minUnixTimestamp: normalizeUnixFloor(DEFAULT_DATE_RANGE[0]) ?? 0,
    maxUnixTimestamp: normalizeUnixCeil(DEFAULT_DATE_RANGE[1]),
    prevMinUnixTimestamp: normalizeUnixFloor(DEFAULT_PREV_DATE_RANGE[0]) ?? 0,
    prevMaxUnixTimestamp: normalizeUnixCeil(DEFAULT_PREV_DATE_RANGE[1]),
  };
}

export const Route = createFileRoute("/heroes")({
  component: HeroesPage,
  loader: async ({ context: { queryClient } }) => {
    const r = defaultHeroStatsRanges();
    const common = {
      minHeroMatches: 0,
      minHeroMatchesTotal: 0,
      minAverageBadge: DEFAULT_MIN_RANK,
      maxAverageBadge: DEFAULT_MAX_RANK,
      gameMode: "normal" as const,
    };
    await Promise.all([
      prefetchSafe(
        queryClient.ensureQueryData(
          heroStatsQueryOptions({
            ...common,
            minUnixTimestamp: r.minUnixTimestamp,
            maxUnixTimestamp: r.maxUnixTimestamp,
          }),
        ),
      ),
      prefetchSafe(
        queryClient.ensureQueryData(
          heroStatsQueryOptions({
            ...common,
            minUnixTimestamp: r.prevMinUnixTimestamp,
            maxUnixTimestamp: r.prevMaxUnixTimestamp,
          }),
        ),
      ),
      prefetchSafe(
        queryClient.ensureQueryData(
          heroBanStatsQueryOptions({
            minAverageBadge: DEFAULT_MIN_RANK,
            maxAverageBadge: DEFAULT_MAX_RANK,
            minUnixTimestamp: r.minUnixTimestamp,
            maxUnixTimestamp: r.maxUnixTimestamp,
          }),
        ),
      ),
      prefetchSafe(
        queryClient.ensureQueryData(
          heroBanStatsQueryOptions({
            minAverageBadge: DEFAULT_MIN_RANK,
            maxAverageBadge: DEFAULT_MAX_RANK,
            minUnixTimestamp: r.prevMinUnixTimestamp,
            maxUnixTimestamp: r.prevMaxUnixTimestamp,
          }),
        ),
      ),
    ]);
  },
  head: () =>
    seo({
      title: "Deadlock Hero Win Rates & Pick Rates — Live Match Data",
      description:
        "Deadlock hero win rates, pick rates, matchups, and synergies for every hero. Filter by rank and patch. Updated daily from live match data.",
      path: "/heroes",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Dataset",
        name: "Deadlock Hero Win Rates & Pick Rates",
        description:
          "Win rates, pick rates, ban rates, and matchup data for every Deadlock hero, calculated from tracked ranked matches and updated daily. Filterable by rank, patch, and game mode.",
        url: "https://deadlock-api.com/heroes",
        keywords: ["Deadlock", "hero win rates", "pick rates", "ban rates", "matchups", "hero meta"],
        creator: { "@type": "Organization", name: "Deadlock API", url: "https://deadlock-api.com" },
        isAccessibleForFree: true,
        license: "https://github.com/deadlock-api/",
      },
    }),
});

function HeroesPage({ initialTab = "stats" }: { initialTab?: HeroTab } = {}) {
  const filters = useHeroFilters(initialTab);
  const [groupByType, setGroupByType] = useQueryState("group_by_type", parseAsBoolean.withDefault(false));
  const groupByTypeId = useId();
  const sameLaneFilterId1 = useId();
  const sameLaneFilterId2 = useId();

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Deadlock Hero Win Rates</h1>
        <p className="mt-1 text-sm text-muted-foreground">Detailed analytics and matchup data for Deadlock heroes</p>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Explore win rates, pick rates, and matchup data for every Deadlock hero. Filter by rank, patch, and game mode
          to find the strongest heroes in the current meta or analyze how hero performance changes over time. Statistics
          are calculated from tracked ranked matches and updated in real time.
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
            <h2 className="sr-only">Overall Hero Stats</h2>
            <div className="flex items-center justify-end gap-2">
              <Label htmlFor={groupByTypeId} className="text-sm font-semibold text-nowrap text-foreground">
                Group by Type
              </Label>
              <Switch id={groupByTypeId} checked={groupByType} onCheckedChange={(checked) => setGroupByType(checked)} />
            </div>
            <HeroStatsTable
              columns={["winRate", "pickRate", "zScore", "residual", "details"]}
              groupByType={groupByType}
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
            <h2 className="sr-only">Hero Stats Over Time</h2>
            <div className="flex flex-wrap items-start justify-center gap-2 sm:flex-nowrap">
              <div className="flex flex-col gap-1.5">
                <span className="text-sm text-muted-foreground">Stat</span>
                <HeroStatSelector
                  value={filters.heroStat}
                  onChange={(val) => filters.setHeroStat(val as typeof filters.heroStat)}
                  options={HERO_STATS_WITH_BAN_RATE}
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
                  bumpChart={false}
                />
              </Suspense>
            </ChunkErrorBoundary>
          </div>
        </TabsContent>

        <TabsContent value="stats-by-duration">
          <div className="flex flex-col gap-4">
            <h2 className="sr-only">Hero Stats by Game Duration</h2>
            <div className="flex flex-wrap justify-center gap-2 sm:flex-nowrap">
              <div className="flex flex-col gap-1.5">
                <span className="text-sm text-muted-foreground">Stat</span>
                <HeroStatSelector
                  value={filters.heroStat === "ban_rate" ? "winrate" : filters.heroStat}
                  onChange={(val) => filters.setHeroStat(val as typeof filters.heroStat)}
                  options={HERO_STATS}
                />
              </div>
            </div>
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
                />
              </Suspense>
            </ChunkErrorBoundary>
          </div>
        </TabsContent>

        <TabsContent value="stats-by-rank">
          <div className="flex flex-col gap-4">
            <h2 className="sr-only">Hero Stats by Rank</h2>
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
            <h2 className="sr-only">Hero Stats by Experience</h2>
            <div className="flex flex-wrap justify-center gap-2 sm:flex-nowrap">
              <div className="flex flex-col gap-1.5">
                <span className="text-sm text-muted-foreground">Stat</span>
                <HeroStatSelector
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
                />
              </Suspense>
            </ChunkErrorBoundary>
          </div>
        </TabsContent>

        <TabsContent value="matchups">
          <div className="mt-4 flex flex-col gap-4">
            <h2 className="sr-only">Hero Matchups</h2>
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
                    gameMode={filters.gameMode}
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
            <h2 className="sr-only">Hero Matchup Details</h2>
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
                    prevMinDate={filters.prevDates.prevStartDate}
                    prevMaxDate={filters.prevDates.prevEndDate}
                    onHeroSelected={(selectedHeroId) => {
                      if (!selectedHeroId) return;
                      filters.setHeroId(selectedHeroId);
                    }}
                    sameLaneFilter={filters.sameLaneFilter}
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
                    prevMinDate={filters.prevDates.prevStartDate}
                    prevMaxDate={filters.prevDates.prevEndDate}
                    onHeroSelected={(selectedHeroId) => {
                      if (!selectedHeroId) return;
                      filters.setHeroId(selectedHeroId);
                    }}
                    sameLaneFilter={filters.sameLaneFilter}
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
