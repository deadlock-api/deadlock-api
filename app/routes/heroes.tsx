import { useEffect, useState } from "react";
import DatePicker from "react-datepicker";
import type { MetaFunction } from "react-router";
import { useLocation } from "react-router";
import HeroMatchupStatsTable, { HeroMatchupStatsTableStat } from "~/components/hero_matchup_stats_table";
import HeroName from "~/components/hero_name";
import HeroSelector from "~/components/hero_selector";
import HeroStatsTable from "~/components/hero_stats_table";
import HeroesMatchupStatsTable from "~/components/heroes_matchup_stats_table";
import RankSelector from "~/components/rank_selector";
import "react-datepicker/dist/react-datepicker.css";
import HeroCombStatsTable from "~/components/hero_combs_stats_table";

export const meta: MetaFunction = () => {
  return [
    { title: "Heroes - Deadlock API" },
    { name: "description", content: "Detailed analytics about Heroes in Deadlock" },
  ];
};

export default function Heroes({ initialTab }: { initialTab?: string } = { initialTab: "general" }) {
  const [minRankId, setMinRankId] = useState<number>(0);
  const [maxRankId, setMaxRankId] = useState<number>(116);

  const initialStartDate = new Date();
  initialStartDate.setDate(initialStartDate.getDate() - 30);
  initialStartDate.setUTCHours(0, 0, 0, 0);

  const initialEndDate = new Date();
  initialEndDate.setUTCHours(0, 0, 0, 0);

  const [startDate, setStartDate] = useState<Date | null>(initialStartDate);
  const [endDate, setEndDate] = useState<Date | null>(initialEndDate);

  const location = useLocation();
  const [searchParams, setSearchParams] = useState<URLSearchParams | null>(new URLSearchParams(location.search));
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setSearchParams(params);

    const searchTab = params?.get("tab") || initialTab || "general";
    if (searchTab) {
      setTab(searchTab);
    }

    const searchHeroIdString = params?.get("heroId");
    const searchHeroId = searchHeroIdString ? Number.parseInt(searchHeroIdString) : null;
    setHeroId(searchHeroId || 15);
  }, [location.search, initialTab]);

  const searchTab = searchParams?.get("tab");
  const [tab, setTab] = useState(searchTab || initialTab || "general");

  const searchHeroIdString = searchParams?.get("heroId");
  const searchHeroId = searchHeroIdString ? Number.parseInt(searchHeroIdString) : null;
  const [heroId, setHeroId] = useState(searchHeroId || 15);

  const handleTabChange = (newTab: string) => {
    setTab(newTab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", newTab);
      window.history.pushState({}, "", url);
    }
  };

  return (
    <>
      <h2 className="text-3xl font-bold text-center mb-2">Hero Stats</h2>
      <p className="mb-4 text-gray-300 text-center text-sm italic">(Last 30 days)</p>

      <div className="flex gap-4 justify-center items-center text-center p-4 mb-4 w-fit mx-auto rounded-lg bg-gray-100 dark:bg-gray-800">
        <RankSelector onRankSelected={setMinRankId} selectedRank={minRankId} label="Minimum Rank" />
        <RankSelector onRankSelected={setMaxRankId} selectedRank={maxRankId} label="Maximum Rank" />

        <hr className="bg-white h-12 w-0.25" />

        <div className="flex items-center gap-2.5">
          <div className="flex flex-col items-center justify-around h-full">
            <p className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">Start Date</p>
            <div className="border text-sm rounded-lg block w-full py-1.5 bg-gray-700 border-gray-600 placeholder-gray-400 text-white">
              <DatePicker selected={startDate} onChange={(date) => setStartDate(date)} />
            </div>
          </div>

          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" className="fill-white">
            <title>Arrow Right</title>
            <path d="M10 20A10 10 0 1 0 0 10a10 10 0 0 0 10 10zM8.711 4.3l5.7 5.766L8.7 15.711l-1.4-1.422 4.289-4.242-4.3-4.347z" />
          </svg>

          <div className="flex flex-col items-center justify-around h-full">
            <p className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">End Date</p>
            <div className="border text-sm rounded-lg block w-full py-1.5 bg-gray-700 border-gray-600 placeholder-gray-400 text-white">
              <DatePicker selected={endDate} onChange={(date) => setEndDate(date)} />
            </div>
          </div>
        </div>
      </div>
      <div className="text-sm font-medium text-center text-gray-500 border-b border-gray-200 dark:text-gray-400 dark:border-gray-700 mb-4">
        <ul className="flex flex-wrap -mb-px">
          <li className="me-2">
            <button
              type="button"
              onClick={() => handleTabChange("general")}
              aria-current={tab === "general" ? "page" : undefined}
              className={
                tab === "general"
                  ? "inline-block p-4 text-blue-600 border-b-2 border-blue-600 rounded-t-lg active dark:text-blue-500 dark:border-blue-500"
                  : "inline-block p-4 border-b-2 border-transparent rounded-t-lg hover:text-gray-600 hover:border-gray-300 dark:hover:text-gray-300"
              }
            >
              General Stats
            </button>
          </li>
          <li className="me-2">
            <button
              type="button"
              onClick={() => handleTabChange("matchups")}
              aria-current={tab === "matchups" ? "page" : undefined}
              className={
                tab === "matchups"
                  ? "inline-block p-4 text-blue-600 border-b-2 border-blue-600 rounded-t-lg active dark:text-blue-500 dark:border-blue-500"
                  : "inline-block p-4 border-b-2 border-transparent rounded-t-lg hover:text-gray-600 hover:border-gray-300 dark:hover:text-gray-300"
              }
            >
              Hero Matchups
            </button>
          </li>
          <li className="me-2">
            <button
              type="button"
              onClick={() => handleTabChange("hero-combs")}
              aria-current={tab === "hero-combs" ? "page" : undefined}
              className={
                tab === "hero-combs"
                  ? "inline-block p-4 text-blue-600 border-b-2 border-blue-600 rounded-t-lg active dark:text-blue-500 dark:border-blue-500"
                  : "inline-block p-4 border-b-2 border-transparent rounded-t-lg hover:text-gray-600 hover:border-gray-300 dark:hover:text-gray-300"
              }
            >
              Hero Combinations
            </button>
          </li>
          <li className="me-2">
            <button
              type="button"
              onClick={() => handleTabChange("hero-details")}
              aria-current={tab === "hero-details" ? "page" : undefined}
              className={
                tab === "hero-details"
                  ? "inline-block p-4 text-blue-600 border-b-2 border-blue-600 rounded-t-lg active dark:text-blue-500 dark:border-blue-500"
                  : "inline-block p-4 border-b-2 border-transparent rounded-t-lg hover:text-gray-600 hover:border-gray-300 dark:hover:text-gray-300"
              }
            >
              Hero Details
            </button>
          </li>
        </ul>
      </div>

      {tab === "general" && (
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
      {tab === "hero-details" && (
        <>
          <h2 className="text-2xl font-bold text-center mb-2">
            Details for <HeroName heroId={heroId} />
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
