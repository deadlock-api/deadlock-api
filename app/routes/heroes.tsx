import type { MetaFunction } from "@remix-run/node";
import { useLocation } from "@remix-run/react";
import { useEffect, useState } from "react";
import HeroMatchupStatsTable, { HeroMatchupStatsTableStat } from "~/components/hero_matchup_stats_table";
import HeroName from "~/components/hero_name";
import HeroSelector from "~/components/hero_selector";
import HeroStatsTable from "~/components/hero_stats_table";
import HeroesMatchupStatsTable from "~/components/heroes_matchup_stats_table";

export const meta: MetaFunction = () => {
  return [
    { title: "Heroes - Deadlock API" },
    { name: "description", content: "Detailed analytics about Heroes in Deadlock" },
  ];
};

export default function Heroes({ initialTab }: { initialTab?: string } = { initialTab: "general" }) {
  const location = useLocation();
  const [searchParams, setSearchParams] = useState<URLSearchParams | null>(new URLSearchParams(location.search));
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setSearchParams(params);

    const searchTab = params?.get("tab");
    if (searchTab) {
      setTab(searchTab);
    }

    const searchHeroIdString = params?.get("heroId");
    const searchHeroId = searchHeroIdString ? Number.parseInt(searchHeroIdString) : null;
    setHeroId(searchHeroId || 15);
  }, [location.search]);

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
          <HeroStatsTable columns={["winRate", "pickRate", "KDA"]} sortBy="winrate" />
        </div>
      )}
      {tab === "matchups" && (
        <div className="flex flex-col gap-4">
          <HeroesMatchupStatsTable />
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
                setHeroId(selectedHeroId);
                if (typeof window !== "undefined") {
                  const url = new URL(window.location.href);
                  url.searchParams.set("heroId", selectedHeroId.toString());
                  window.history.pushState({}, "", url);
                }
              }}
            />
            <div className="grid grid-cols-2 gap-4">
              <HeroMatchupStatsTable heroId={heroId} stat={HeroMatchupStatsTableStat.SYNERGY} />
              <HeroMatchupStatsTable heroId={heroId} stat={HeroMatchupStatsTableStat.COUNTER} />
            </div>
          </div>
        </>
      )}
    </>
  );
}
