import { parseAsBoolean, parseAsInteger, parseAsStringLiteral, useQueryState } from "nuqs";
import { Suspense, lazy, useId, useState } from "react";
import type { MetaFunction } from "react-router";
import { Filter } from "~/components/Filter";
import {
  BY_RANK_STATS,
  HeroStatSelector,
  HeroTimeIntervalSelector,
} from "~/components/heroes-page/HeroStatSelectors";
import HeroStatsTable from "~/components/heroes-page/HeroStatsTable";
import { LoadingLogo } from "~/components/LoadingLogo";
import { computePreviousPeriod } from "~/components/PatchOrDatePicker";
import { parseAsGameMode } from "~/components/selectors/GameModeSelector";
import HeroSelector from "~/components/selectors/HeroSelector";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { PATCHES } from "~/lib/constants";
import { createPageMeta } from "~/lib/meta";
import { parseAsDayjsRange } from "~/lib/nuqs-parsers";
import { HERO_STATS } from "~/types/api_hero_stats";

const HeroStatsOverTimeChart = lazy(() => import("~/components/heroes-page/HeroStatsOverTimeChart"));
const HeroStatsByDurationChart = lazy(() => import("~/components/heroes-page/HeroStatsByDurationChart"));
const HeroStatsByRankChart = lazy(() => import("~/components/heroes-page/HeroStatsByRankChart"));
const HeroStatsByExperienceTable = lazy(() => import("~/components/heroes-page/HeroStatsByExperienceTable"));
const HeroMatchupStatsTable = lazy(() => import("~/components/heroes-page/HeroMatchupStatsTable"));
const HeroCombStatsTable = lazy(() => import("~/components/heroes-page/HeroCombStatsTable"));
const HeroMatchupDetailsStatsTable = lazy(() => import("~/components/heroes-page/HeroMatchupDetailsStatsTable"));

export const meta: MetaFunction = () => {
  return createPageMeta({
    title: "Hero Stats & Analytics | Deadlock API",
    description: "View win rates, pick rates, matchups, and performance analytics for all Deadlock heroes.",
    path: "/heroes",
  });
};
export default function Heroes(
  {
    initialTab,
  }: {
    initialTab?:
      | "stats"
      | "stats-over-time"
      | "stats-by-duration"
      | "stats-by-rank"
      | "stats-by-experience"
      | "matchups"
      | "hero-combs"
      | "hero-matchup-details";
  } = {
    initialTab: "stats",
  },
) {
  const [gameMode, setGameMode] = useQueryState("game_mode", parseAsGameMode);
  const [minMatches, setMinMatches] = useQueryState("min_matches", parseAsInteger.withDefault(10));
  const [minHeroMatches, setMinHeroMatches] = useQueryState("min_hero_matches", parseAsInteger.withDefault(0));
  const [minHeroMatchesTotal, setMinHeroMatchesTotal] = useQueryState(
    "min_hero_matches_total",
    parseAsInteger.withDefault(0),
  );
  const [minRankId, setMinRankId] = useQueryState("min_rank", parseAsInteger.withDefault(91));
  const [maxRankId, setMaxRankId] = useQueryState("max_rank", parseAsInteger.withDefault(116));
  const [sameLaneFilter, setSameLaneFilter] = useQueryState("same_lane", parseAsBoolean.withDefault(true));
  const [samePartyFilter, setSamePartyFilter] = useQueryState("same_party", parseAsBoolean.withDefault(false));
  const sameLaneFilterId1 = useId();
  const samePartyFilterId1 = useId();
  const sameLaneFilterId2 = useId();
  const samePartyFilterId2 = useId();
  const [[startDate, endDate], setDateRange] = useQueryState(
    "date_range",
    parseAsDayjsRange.withDefault([PATCHES[0].startDate, PATCHES[0].endDate]),
  );
  const [prevDates, setPrevDates] = useState(() =>
    computePreviousPeriod(PATCHES[0].startDate, PATCHES[0].endDate, PATCHES),
  );
  const [tab, setTab] = useQueryState(
    "tab",
    parseAsStringLiteral([
      "stats",
      "stats-over-time",
      "stats-by-duration",
      "stats-by-rank",
      "stats-by-experience",
      "matchups",
      "hero-combs",
      "hero-matchup-details",
    ] as const).withDefault(initialTab || "stats"),
  );
  const [heroId, setHeroId] = useQueryState("hero_id", parseAsInteger.withDefault(7));

  const [heroStat, setHeroStat] = useQueryState("hero_stat", parseAsStringLiteral(HERO_STATS).withDefault("winrate"));
  const [heroTimeInterval, setHeroTimeInterval] = useQueryState(
    "time_interval",
    parseAsStringLiteral(["start_time_hour", "start_time_day", "start_time_week"] as const).withDefault(
      "start_time_day",
    ),
  );
  const [byRankX, setByRankX] = useQueryState("by_rank_x", parseAsStringLiteral(BY_RANK_STATS).withDefault("pickrate"));
  const [byRankY, setByRankY] = useQueryState("by_rank_y", parseAsStringLiteral(BY_RANK_STATS).withDefault("winrate"));

  const isStreetBrawl = gameMode === "street_brawl";
  const effectiveMinRankId = isStreetBrawl ? undefined : minRankId;
  const effectiveMaxRankId = isStreetBrawl ? undefined : maxRankId;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Hero Stats</h1>
        <p className="text-sm text-muted-foreground mt-1">Detailed analytics and matchup data for Deadlock heroes</p>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl mx-auto leading-relaxed">
          Explore win rates, pick rates, and matchup data for every Deadlock hero. Filter by rank, patch, and game mode
          to find the strongest heroes in the current meta or analyze how hero performance changes over time.
        </p>
      </div>

      <Filter.Root>
        {["stats", "stats-over-time", "stats-by-duration", "stats-by-rank", "stats-by-experience"].includes(tab) ? (
          <>
            <Filter.MinMatches
              value={minHeroMatches}
              onChange={setMinHeroMatches}
              label="Min Hero Matches (Timerange)"
              step={10}
            />
            <Filter.MinMatches
              value={minHeroMatchesTotal}
              onChange={setMinHeroMatchesTotal}
              label="Min Hero Matches (Total)"
              step={100}
            />
          </>
        ) : (
          <Filter.MinMatches value={minMatches} onChange={setMinMatches} label="Min Matches (Total)" step={10} />
        )}
        {tab !== "stats-by-rank" && (
          <Filter.GameModeWithRank
            gameMode={gameMode}
            onGameModeChange={setGameMode}
            minRank={minRankId}
            maxRank={maxRankId}
            onRankChange={(min, max) => {
              setMinRankId(min);
              setMaxRankId(max);
            }}
          />
        )}
        <Filter.PatchOrDate
          startDate={startDate}
          endDate={endDate}
          onDateChange={(s, e, ps, pe) => {
            setDateRange([s, e]);
            setPrevDates({ prevStartDate: ps, prevEndDate: pe });
          }}
        />
      </Filter.Root>

      <Tabs value={tab ?? undefined} onValueChange={(value) => setTab(value as typeof tab)} className="tabs-nav w-full">
        <TabsList variant="line" className="w-full overflow-x-auto scrollbar-none">
          <TabsTrigger value="stats">Overall Stats</TabsTrigger>
          <TabsTrigger value="stats-over-time">Stats Over Time</TabsTrigger>
          <TabsTrigger value="stats-by-duration">Stats by Duration</TabsTrigger>
          <TabsTrigger value="stats-by-rank">Stats by Rank</TabsTrigger>
          <TabsTrigger value="stats-by-experience">Stats by Experience</TabsTrigger>
          <TabsTrigger value="hero-combs">Hero Combs</TabsTrigger>
          <TabsTrigger value="matchups">Matchups</TabsTrigger>
          <TabsTrigger value="hero-matchup-details">Matchup Details</TabsTrigger>
        </TabsList>

        <TabsContent value="stats">
          <div className="flex flex-col gap-4">
            <HeroStatsTable
              columns={["winRate", "pickRate", "KDA", "totalMatches"]}
              sortBy="winrate"
              minRankId={effectiveMinRankId}
              maxRankId={effectiveMaxRankId}
              minHeroMatches={minHeroMatches}
              minHeroMatchesTotal={minHeroMatchesTotal}
              minDate={startDate || undefined}
              maxDate={endDate || undefined}
              prevMinDate={prevDates.prevStartDate}
              prevMaxDate={prevDates.prevEndDate}
              gameMode={gameMode}
            />
          </div>
        </TabsContent>

        <TabsContent value="stats-over-time">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap justify-center sm:flex-nowrap gap-2">
              <div className="flex flex-col gap-1.5">
                <span className="text-sm text-muted-foreground">Stat</span>
                <HeroStatSelector
                  value={heroStat as (typeof HERO_STATS)[number]}
                  onChange={(val) => setHeroStat(val as typeof heroStat)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm text-muted-foreground">Time Interval</span>
                <HeroTimeIntervalSelector
                  value={heroTimeInterval ?? undefined}
                  onChange={(val) => setHeroTimeInterval(val as typeof heroTimeInterval)}
                />
              </div>
            </div>
            <Suspense fallback={<LoadingLogo />}>
              <HeroStatsOverTimeChart
                heroStat={heroStat as (typeof HERO_STATS)[number]}
                heroTimeInterval={heroTimeInterval}
                minRankId={effectiveMinRankId}
                maxRankId={effectiveMaxRankId}
                minHeroMatches={minHeroMatches}
                minHeroMatchesTotal={minHeroMatchesTotal}
                minDate={startDate}
                maxDate={endDate}
                gameMode={gameMode}
              />
            </Suspense>
          </div>
        </TabsContent>

        <TabsContent value="stats-by-duration">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap justify-center sm:flex-nowrap gap-2">
              <div className="flex flex-col gap-1.5">
                <span className="text-sm text-muted-foreground">Stat</span>
                <HeroStatSelector
                  value={heroStat as (typeof HERO_STATS)[number]}
                  onChange={(val) => setHeroStat(val as typeof heroStat)}
                />
              </div>
            </div>
            <Suspense fallback={<LoadingLogo />}>
              <HeroStatsByDurationChart
                heroStat={heroStat as (typeof HERO_STATS)[number]}
                minRankId={effectiveMinRankId}
                maxRankId={effectiveMaxRankId}
                minHeroMatches={minHeroMatches}
                minHeroMatchesTotal={minHeroMatchesTotal}
                minDate={startDate}
                maxDate={endDate}
                gameMode={gameMode}
              />
            </Suspense>
          </div>
        </TabsContent>

        <TabsContent value="stats-by-rank">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col items-center gap-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-sm text-muted-foreground">X Axis</span>
                <HeroStatSelector value={byRankX} onChange={(val) => setByRankX(val)} options={BY_RANK_STATS} />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm text-muted-foreground">Y Axis</span>
                <HeroStatSelector value={byRankY} onChange={(val) => setByRankY(val)} options={BY_RANK_STATS} />
              </div>
            </div>
            <Suspense fallback={<LoadingLogo />}>
              <HeroStatsByRankChart
                minHeroMatches={minHeroMatches}
                minHeroMatchesTotal={minHeroMatchesTotal}
                minDate={startDate}
                maxDate={endDate}
                gameMode={"normal"}
                xStat={byRankX}
                yStat={byRankY}
              />
            </Suspense>
          </div>
        </TabsContent>

        <TabsContent value="stats-by-experience">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap justify-center sm:flex-nowrap gap-2">
              <div className="flex flex-col gap-1.5">
                <span className="text-sm text-muted-foreground">Stat</span>
                <HeroStatSelector
                  value={heroStat as (typeof HERO_STATS)[number]}
                  onChange={(val) => setHeroStat(val as typeof heroStat)}
                />
              </div>
            </div>
            <Suspense fallback={<LoadingLogo />}>
              <HeroStatsByExperienceTable
                heroStat={heroStat as (typeof HERO_STATS)[number]}
                minRankId={effectiveMinRankId}
                maxRankId={effectiveMaxRankId}
                minHeroMatches={minHeroMatches}
                minDate={startDate}
                maxDate={endDate}
                gameMode={gameMode}
              />
            </Suspense>
          </div>
        </TabsContent>

        <TabsContent value="matchups">
          <div className="flex flex-col gap-4 mt-4">
            <div className="flex flex-wrap justify-center items-center sm:flex-nowrap gap-8">
              <div className="flex items-center gap-2">
                <Label htmlFor={sameLaneFilterId1} className="text-sm font-semibold text-foreground text-nowrap">
                  Same Lane Filter
                </Label>
                <Checkbox
                  id={sameLaneFilterId1}
                  checked={sameLaneFilter}
                  onCheckedChange={(i) => setSameLaneFilter(i === true)}
                />
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor={samePartyFilterId1} className="text-sm font-semibold text-foreground text-nowrap">
                  Same Party Filter
                </Label>
                <Checkbox
                  id={samePartyFilterId1}
                  checked={samePartyFilter}
                  onCheckedChange={(i) => setSamePartyFilter(i === true)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <Suspense fallback={<LoadingLogo />}>
                <HeroMatchupStatsTable
                  minRankId={effectiveMinRankId}
                  maxRankId={effectiveMaxRankId}
                  minDate={startDate || undefined}
                  maxDate={endDate || undefined}
                  prevMinDate={prevDates.prevStartDate}
                  prevMaxDate={prevDates.prevEndDate}
                  minMatches={minMatches}
                  sameLaneFilter={sameLaneFilter}
                  samePartyFilter={samePartyFilter}
                  gameMode={gameMode}
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
                minRankId={effectiveMinRankId}
                maxRankId={effectiveMaxRankId}
                minDate={startDate || undefined}
                maxDate={endDate || undefined}
                prevMinDate={prevDates.prevStartDate}
                prevMaxDate={prevDates.prevEndDate}
                minMatches={minMatches}
                gameMode={gameMode}
              />
            </Suspense>
          </div>
        </TabsContent>

        <TabsContent value="hero-matchup-details">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap justify-center items-center sm:flex-nowrap gap-8">
              <HeroSelector
                selectedHero={heroId}
                onHeroSelected={(selectedHeroId) => {
                  if (!selectedHeroId) return;
                  setHeroId(selectedHeroId);
                }}
              />
              <div className="flex flex-col flex-wrap items-center sm:flex-nowrap gap-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor={sameLaneFilterId2} className="text-sm font-semibold text-foreground text-nowrap">
                    Same Lane Filter
                  </Label>
                  <Checkbox
                    id={sameLaneFilterId2}
                    checked={sameLaneFilter}
                    onCheckedChange={(i) => setSameLaneFilter(i === true)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor={samePartyFilterId2} className="text-sm font-semibold text-foreground text-nowrap">
                    Same Party Filter
                  </Label>
                  <Checkbox
                    id={samePartyFilterId2}
                    checked={samePartyFilter}
                    onCheckedChange={(i) => setSamePartyFilter(i === true)}
                  />
                </div>
              </div>
            </div>
            <Suspense fallback={<LoadingLogo />}>
              <div className="grid grid-cols-2 gap-4">
                <HeroMatchupDetailsStatsTable
                  heroId={heroId}
                  stat={0}
                  minRankId={effectiveMinRankId}
                  maxRankId={effectiveMaxRankId}
                  minDate={startDate || undefined}
                  maxDate={endDate || undefined}
                  onHeroSelected={(selectedHeroId) => {
                    if (!selectedHeroId) return;
                    setHeroId(selectedHeroId);
                  }}
                  sameLaneFilter={sameLaneFilter}
                  samePartyFilter={samePartyFilter}
                  minHeroMatches={minMatches}
                  gameMode={gameMode}
                />
                <HeroMatchupDetailsStatsTable
                  heroId={heroId}
                  stat={1}
                  minRankId={effectiveMinRankId}
                  maxRankId={effectiveMaxRankId}
                  minDate={startDate || undefined}
                  maxDate={endDate || undefined}
                  onHeroSelected={(selectedHeroId) => {
                    if (!selectedHeroId) return;
                    setHeroId(selectedHeroId);
                  }}
                  sameLaneFilter={sameLaneFilter}
                  samePartyFilter={samePartyFilter}
                  minHeroMatches={minMatches}
                  gameMode={gameMode}
                />
              </div>
            </Suspense>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
