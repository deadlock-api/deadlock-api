import { useEffect, useState } from "react";
import type { MetaFunction } from "react-router";
import { useLocation } from "react-router";
import HeroName from "~/components/HeroName";
import HeroCombStatsTable from "~/components/heroes-page/HeroCombStatsTable";
import HeroMatchupDetailsStatsTable, {
  HeroMatchupDetailsStatsTableStat,
} from "~/components/heroes-page/HeroMatchupDetailsStatsTable";
import HeroMatchupStatsTable from "~/components/heroes-page/HeroMatchupStatsTable";
import HeroStatsOverTimeChart, {
  HeroStatSelector,
  HeroTimeIntervalSelector,
} from "~/components/heroes-page/HeroStatsOverTimeChart";
import HeroStatsTable from "~/components/heroes-page/HeroStatsTable";
import HeroSelector, { HeroSelectorMultiple } from "~/components/selectors/HeroSelector";
import RankSelector from "~/components/selectors/RankSelector";
import { Card, CardContent } from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import type { Dayjs } from "~/dayjs";
import { PATCHES } from "~/lib/constants";
import type { HERO_STATS, TIME_INTERVALS } from "~/types/api_hero_stats_over_time";
import { PatchOrDatePicker } from "../components/PatchOrDatePicker";

export const meta: MetaFunction = () => {
  return [
    { title: "Heroes - Deadlock API" },
    { name: "description", content: "Detailed analytics about Heroes in Deadlock" },
  ];
};
export default function Heroes({ initialTab }: { initialTab?: string } = { initialTab: "stats" }) {
  const [minRankId, setMinRankId] = useState<number>(0);
  const [maxRankId, setMaxRankId] = useState<number>(116);
  const [sameLaneFilter, setSameLaneFilter] = useState<boolean>(true);

  const [startDate, setStartDate] = useState<Dayjs | null>(PATCHES[0].startDate);
  const [endDate, setEndDate] = useState<Dayjs | null>(PATCHES[0].endDate);

  const location = useLocation();
  const [searchParams, setSearchParams] = useState<URLSearchParams | null>(new URLSearchParams(location.search));
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setSearchParams(params);

    const searchTab = params?.get("tab") || initialTab || "stats";
    if (searchTab) {
      setTab(searchTab);
    }

    const searchHeroIdString = params?.get("heroId");
    const searchHeroId = searchHeroIdString ? Number.parseInt(searchHeroIdString) : null;
    setHeroId(searchHeroId || 15);

    const searchHeroIdsString = params?.get("heroIds");
    const searchHeroIds = searchHeroIdsString
      ?.split(",")
      .map((i) => Number.parseInt(i, 10))
      .filter(Number.isInteger);
    setHeroIds(searchHeroIds || [15]);

    const searchHeroStat = params?.get("heroStat") || "winrate";
    if (searchHeroStat) {
      setHeroStat(searchHeroStat as (typeof HERO_STATS)[number]);
    }

    const searchHeroTimeInterval = params?.get("heroTimeInterval") || "DAY";
    if (searchHeroTimeInterval) {
      setHeroTimeInterval(searchHeroTimeInterval as (typeof TIME_INTERVALS)[number]);
    }
  }, [location.search, initialTab]);

  const searchTab = searchParams?.get("tab");
  const [tab, setTab] = useState(searchTab || initialTab || "stats");

  const searchHeroIdString = searchParams?.get("heroId");
  const searchHeroId = searchHeroIdString ? Number.parseInt(searchHeroIdString) : null;
  const [heroId, setHeroId] = useState(searchHeroId || 15);
  const searchHeroIdsString = searchParams?.get("heroIds");
  const searchHeroIds = searchHeroIdsString
    ?.split(",")
    .map((i) => Number.parseInt(i, 10))
    .filter(Number.isInteger);
  const [heroIds, setHeroIds] = useState(searchHeroIds || [searchHeroId || 15]);
  const [heroStat, setHeroStat] = useState<(typeof HERO_STATS)[number]>("winrate");
  const [heroTimeInterval, setHeroTimeInterval] = useState<(typeof TIME_INTERVALS)[number]>("DAY");

  const handleTabChange = (newTab: string) => {
    setTab(newTab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", newTab);
      window.history.pushState({}, "", url);
    }
  };

  const handleHeroStatChange = (newHeroStat: (typeof HERO_STATS)[number]) => {
    setHeroStat(newHeroStat);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("heroStat", newHeroStat);
      window.history.pushState({}, "", url);
    }
  };

  const handleHeroTimeIntervalChange = (newHeroTimeInterval: (typeof TIME_INTERVALS)[number]) => {
    setHeroTimeInterval(newHeroTimeInterval);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("heroTimeInterval", newHeroTimeInterval);
      window.history.pushState({}, "", url);
    }
  };

  return (
    <>
      <h2 className="text-3xl font-bold text-center mb-2">Hero Stats</h2>

      <Card className="mb-8 w-fit mx-auto">
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 md:gap-8 justify-center md:justify-start text-center">
            <div className="flex flex-wrap justify-center sm:flex-nowrap gap-2">
              <RankSelector onRankSelected={setMinRankId} selectedRank={minRankId} label="Minimum Rank" />
              <RankSelector onRankSelected={setMaxRankId} selectedRank={maxRankId} label="Maximum Rank" />
            </div>

            <div className="flex justify-center md:justify-start">
              <PatchOrDatePicker
                patchDates={PATCHES}
                value={{ startDate, endDate }}
                onValueChange={({ startDate, endDate }) => {
                  setStartDate(startDate);
                  setEndDate(endDate);
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="flex items-center justify-start flex-wrap h-auto w-full">
          <TabsTrigger value="stats">Overall Stats</TabsTrigger>
          <TabsTrigger value="stats-over-time">Stats Over Time</TabsTrigger>
          <TabsTrigger value="matchups">Matchups</TabsTrigger>
          <TabsTrigger value="hero-combs">Hero Combs</TabsTrigger>
          <TabsTrigger value="hero-matchup-details">Matchup Details</TabsTrigger>
        </TabsList>

        <TabsContent value="stats">
          <div className="flex flex-col gap-4">
            <HeroStatsTable
              columns={["winRate", "pickRate", "KDA", "totalMatches"]}
              sortBy="winrate"
              minRankId={minRankId}
              maxRankId={maxRankId}
              minDate={startDate || undefined}
              maxDate={endDate || undefined}
              fullWidth
            />
          </div>
        </TabsContent>

        <TabsContent value="stats-over-time">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap justify-center sm:flex-nowrap gap-2">
              <div className="flex flex-col gap-1.5">
                <span className="text-sm text-muted-foreground">Heroes</span>
                <HeroSelectorMultiple
                  selectedHeroes={heroIds}
                  onHeroesSelected={(selectedHeroIds) => {
                    if (!selectedHeroIds) return;
                    setHeroIds(selectedHeroIds);
                    if (typeof window !== "undefined") {
                      const url = new URL(window.location.href);
                      url.searchParams.set("heroIds", selectedHeroIds.join(","));
                      window.history.pushState({}, "", url);
                    }
                  }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm text-muted-foreground">Stat</span>
                <HeroStatSelector value={heroStat} onChange={handleHeroStatChange} />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm text-muted-foreground">Time Interval</span>
                <HeroTimeIntervalSelector value={heroTimeInterval} onChange={handleHeroTimeIntervalChange} />
              </div>
            </div>
            <HeroStatsOverTimeChart
              heroIds={heroIds}
              heroStat={heroStat}
              heroTimeInterval={heroTimeInterval}
              minRankId={minRankId}
              maxRankId={maxRankId}
              minDate={startDate || undefined}
              maxDate={endDate || undefined}
            />
          </div>
        </TabsContent>

        <TabsContent value="matchups">
          <div className="flex flex-col gap-4 mt-4">
            <div className="flex flex-wrap justify-center items-center sm:flex-nowrap gap-8">
              <div className="flex items-center gap-2">
                <label htmlFor="same-lane-filter" className="text-sm font-semibold text-foreground text-nowrap">
                  Same Lane Filter
                </label>
                <Checkbox
                  id="same-lane-filter"
                  checked={sameLaneFilter}
                  onCheckedChange={(i) => setSameLaneFilter(i === true)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <HeroMatchupStatsTable
                minRankId={minRankId}
                maxRankId={maxRankId}
                minDate={startDate || undefined}
                maxDate={endDate || undefined}
                sameLaneFilter={sameLaneFilter}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="hero-combs">
          <div className="flex flex-col gap-4">
            <HeroCombStatsTable
              columns={["winRate", "pickRate", "totalMatches"]}
              minRankId={minRankId}
              maxRankId={maxRankId}
              minDate={startDate || undefined}
              maxDate={endDate || undefined}
            />
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
                  if (typeof window !== "undefined") {
                    const url = new URL(window.location.href);
                    url.searchParams.set("heroId", selectedHeroId.toString());
                    window.history.pushState({}, "", url);
                  }
                }}
              />
              <div className="flex items-center gap-2">
                <label htmlFor="same-lane-filter" className="text-sm font-semibold text-foreground text-nowrap">
                  Same Lane Filter
                </label>
                <Checkbox
                  id="same-lane-filter"
                  checked={sameLaneFilter}
                  onCheckedChange={(i) => setSameLaneFilter(i === true)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <HeroMatchupDetailsStatsTable
                heroId={heroId}
                stat={HeroMatchupDetailsStatsTableStat.SYNERGY}
                minRankId={minRankId}
                maxRankId={maxRankId}
                minDate={startDate || undefined}
                maxDate={endDate || undefined}
                onHeroSelected={(selectedHeroId) => {
                  if (!selectedHeroId) return;
                  setHeroId(selectedHeroId);
                  if (typeof window !== "undefined") {
                    const url = new URL(window.location.href);
                    url.searchParams.set("heroId", selectedHeroId.toString());
                    window.history.pushState({}, "", url);
                  }
                }}
                sameLaneFilter={sameLaneFilter}
              />
              <HeroMatchupDetailsStatsTable
                heroId={heroId}
                stat={HeroMatchupDetailsStatsTableStat.COUNTER}
                minRankId={minRankId}
                maxRankId={maxRankId}
                minDate={startDate || undefined}
                maxDate={endDate || undefined}
                onHeroSelected={(selectedHeroId) => {
                  if (!selectedHeroId) return;
                  setHeroId(selectedHeroId);
                  if (typeof window !== "undefined") {
                    const url = new URL(window.location.href);
                    url.searchParams.set("heroId", selectedHeroId.toString());
                    window.history.pushState({}, "", url);
                  }
                }}
                sameLaneFilter={sameLaneFilter}
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
