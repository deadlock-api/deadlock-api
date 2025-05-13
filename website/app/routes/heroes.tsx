import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useState } from "react";
import type { MetaFunction } from "react-router";
import { useLocation } from "react-router";
import DatePicker from "~/components/date_picker";
import HeroCombStatsTable from "~/components/heroes-page/HeroCombStatsTable";
import HeroMatchupStatsTable, { HeroMatchupStatsTableStat } from "~/components/heroes-page/HeroMatchupStatsTable";
import HeroName from "~/components/hero_name";
import HeroSelector, { HeroSelectorMultiple } from "~/components/hero_selector";
import HeroStatsOverTimeChart, {
  HeroStatSelector,
  HeroTimeIntervalSelector,
} from "~/components/heroes-page/HeroStatsOverTimeChart";
import HeroStatsTable from "~/components/heroes-page/HeroStatsTable";
import HeroesMatchupStatsTable from "~/components/heroes-page/HeroesMatchupStatsTable";
import RankSelector from "~/components/rank_selector";
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

      <div className="flex flex-wrap gap-8 justify-center items-center text-center p-6 mb-4 w-fit mx-auto rounded-lg bg-gray-800">
        <div className="flex flex-wrap sm:flex-nowrap gap-2">
          <RankSelector onRankSelected={setMinRankId} selectedRank={minRankId} label="Minimum Rank" />
          <RankSelector onRankSelected={setMaxRankId} selectedRank={maxRankId} label="Maximum Rank" />
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex flex-col items-center justify-around h-full">
            <DatePicker selectedDate={startDate} onDateSelected={(date) => setStartDate(date)} type="start" />
          </div>

          <div className="mt-8">
            <span className="icon-[material-symbols--line-end-arrow-outline-rounded] text-gray-400 text-2xl" />
          </div>

          <div className="flex flex-col items-center justify-around h-full">
            <DatePicker selectedDate={endDate} onDateSelected={(date) => setEndDate(date)} type="end" />
          </div>
        </div>
      </div>
      <div className="text-sm font-medium text-center border-b border-gray-600 text-gray-400 mb-4">
        <ul className="flex flex-wrap -mb-px">
          <li className="me-2">
            <button
              type="button"
              onClick={() => handleTabChange("stats")}
              aria-current={tab === "stats" ? "page" : undefined}
              className={
                tab === "stats"
                  ? "inline-block p-4 text-blue-600 border-b-2 border-blue-600 rounded-t-lg active"
                  : "inline-block p-4 border-b-2 border-transparent rounded-t-lg hover:text-gray-600 hover:border-gray-300"
              }
            >
              Hero Stats
            </button>
          </li>
          <li className="me-2">
            <button
              type="button"
              onClick={() => handleTabChange("stats-over-time")}
              aria-current={tab === "stats-over-time" ? "page" : undefined}
              className={
                tab === "stats-over-time"
                  ? "inline-block p-4 text-blue-600 border-b-2 border-blue-600 rounded-t-lg active"
                  : "inline-block p-4 border-b-2 border-transparent rounded-t-lg hover:text-gray-600 hover:border-gray-300"
              }
            >
              Hero Stats Over Time
            </button>
          </li>
          <li className="me-2">
            <button
              type="button"
              onClick={() => handleTabChange("matchups")}
              aria-current={tab === "matchups" ? "page" : undefined}
              className={
                tab === "matchups"
                  ? "inline-block p-4 text-blue-600 border-b-2 border-blue-600 rounded-t-lg active"
                  : "inline-block p-4 border-b-2 border-transparent rounded-t-lg hover:text-gray-600 hover:border-gray-300"
              }
            >
              Hero Matchups
            </button>
          </li>
          <li className="me-2">
            <button
              type="button"
              onClick={() => handleTabChange("hero-matchup-details")}
              aria-current={tab === "hero-matchup-details" ? "page" : undefined}
              className={
                tab === "hero-matchup-details"
                  ? "inline-block p-4 text-blue-600 border-b-2 border-blue-600 rounded-t-lg active"
                  : "inline-block p-4 border-b-2 border-transparent rounded-t-lg hover:text-gray-600 hover:border-gray-300"
              }
            >
              Hero Matchup Details
            </button>
          </li>
          <li className="me-2">
            <button
              type="button"
              onClick={() => handleTabChange("hero-combs")}
              aria-current={tab === "hero-combs" ? "page" : undefined}
              className={
                tab === "hero-combs"
                  ? "inline-block p-4 text-blue-600 border-b-2 border-blue-600 rounded-t-lg active"
                  : "inline-block p-4 border-b-2 border-transparent rounded-t-lg hover:text-gray-600 hover:border-gray-300"
              }
            >
              Hero Combinations
            </button>
          </li>
        </ul>
      </div>

      {tab === "stats" && (
        <div className="flex flex-col gap-4">
          <HeroStatsTable
            columns={["winRate", "pickRate", "KDA", "totalMatches"]}
            sortBy="winrate"
            minRankId={minRankId}
            maxRankId={maxRankId}
            minDate={startDate || undefined}
            maxDate={endDate || undefined}
          />
        </div>
      )}
      {tab === "stats-over-time" && (
        <>
          <h2 className="text-2xl font-bold text-center mb-2">Hero Stats over time</h2>
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap justify-center sm:flex-nowrap gap-2">
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
              <HeroStatSelector value={heroStat} onChange={handleHeroStatChange} />
              <HeroTimeIntervalSelector value={heroTimeInterval} onChange={handleHeroTimeIntervalChange} />
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
        </>
      )}
      {tab === "matchups" && (
        <div className="flex flex-col gap-4">
          <HeroesMatchupStatsTable
            minRankId={minRankId}
            maxRankId={maxRankId}
            minDate={startDate || undefined}
            maxDate={endDate || undefined}
          />
        </div>
      )}
      {tab === "hero-combs" && (
        <div className="flex flex-col gap-4">
          <HeroCombStatsTable
            columns={["winRate", "pickRate", "totalMatches"]}
            minRankId={minRankId}
            maxRankId={maxRankId}
            minDate={startDate || undefined}
            maxDate={endDate || undefined}
          />
        </div>
      )}
      {tab === "hero-matchup-details" && (
        <>
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
              <HeroMatchupStatsTable
                heroId={heroId}
                stat={HeroMatchupStatsTableStat.SYNERGY}
                minRankId={minRankId}
                maxRankId={maxRankId}
                minDate={startDate || undefined}
                maxDate={endDate || undefined}
              />
              <HeroMatchupStatsTable
                heroId={heroId}
                stat={HeroMatchupStatsTableStat.COUNTER}
                minRankId={minRankId}
                maxRankId={maxRankId}
                minDate={startDate || undefined}
                maxDate={endDate || undefined}
              />
            </div>
          </div>
        </>
      )}
    </>
  );
}
