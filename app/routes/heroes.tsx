import dayjs, { type Dayjs } from "dayjs";
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
import DatePicker from "~/components/primitives/DatePicker";
import HeroSelector, { HeroSelectorMultiple } from "~/components/selectors/HeroSelector";
import RankSelector from "~/components/selectors/RankSelector";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import type { HERO_STATS, TIME_INTERVALS } from "~/types/api_hero_stats_over_time";

export const meta: MetaFunction = () => {
  return [
    { title: "Heroes - Deadlock API" },
    { name: "description", content: "Detailed analytics about Heroes in Deadlock" },
  ];
};

export default function Heroes({ initialTab }: { initialTab?: string } = { initialTab: "stats" }) {
  const [minRankId, setMinRankId] = useState<number>(0);
  const [maxRankId, setMaxRankId] = useState<number>(116);

  const initialStartDate = dayjs().subtract(30, "day").startOf("day");
  const initialEndDate = dayjs().subtract(1, "day").startOf("day");

  const [startDate, setStartDate] = useState<Dayjs | null>(initialStartDate);
  const [endDate, setEndDate] = useState<Dayjs | null>(initialEndDate);

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
          <div className="flex flex-col md:flex-row gap-4 md:gap-8 justify-center items-center text-center">
            <div className="flex flex-wrap justify-center sm:flex-nowrap gap-2">
              <RankSelector onRankSelected={setMinRankId} selectedRank={minRankId} label="Minimum Rank" />
              <RankSelector onRankSelected={setMaxRankId} selectedRank={maxRankId} label="Maximum Rank" />
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-2.5">
              <DatePicker
                selectedDate={startDate}
                onDateSelected={(date) => setStartDate(date)}
                type="start"
                label="Start Date"
              />

              <div className="hidden sm:block sm:mt-8">
                <span className="icon-[material-symbols--line-end-arrow-outline-rounded] text-gray-400 text-2xl" />
              </div>

              <DatePicker
                selectedDate={endDate}
                onDateSelected={(date) => setEndDate(date)}
                type="end"
                label="End Date"
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
          <h2 className="text-2xl font-bold text-center mb-2">Hero Stats over time</h2>
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
          <div className="flex flex-col gap-4">
            <HeroMatchupStatsTable
              minRankId={minRankId}
              maxRankId={maxRankId}
              minDate={startDate || undefined}
              maxDate={endDate || undefined}
            />
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
          <h2 className="text-2xl font-bold text-center mb-2">
            Matchup Details for <HeroName heroId={heroId} />
          </h2>
          <div className="flex flex-col gap-4">
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
            <div className="grid grid-cols-2 gap-4">
              <HeroMatchupDetailsStatsTable
                heroId={heroId}
                stat={HeroMatchupDetailsStatsTableStat.SYNERGY}
                minRankId={minRankId}
                maxRankId={maxRankId}
                minDate={startDate || undefined}
                maxDate={endDate || undefined}
              />
              <HeroMatchupDetailsStatsTable
                heroId={heroId}
                stat={HeroMatchupDetailsStatsTableStat.COUNTER}
                minRankId={minRankId}
                maxRankId={maxRankId}
                minDate={startDate || undefined}
                maxDate={endDate || undefined}
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
