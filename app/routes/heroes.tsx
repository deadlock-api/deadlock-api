import type { MetaFunction } from "@remix-run/node";
import { useState } from "react";
import HeroMatchupStatsTable from "~/components/hero_matchup_stats_table";
import HeroStatsTable from "~/components/hero_stats_table";

export const meta: MetaFunction = () => {
  return [
    { title: "Heroes - Deadlock API" },
    { name: "description", content: "Detailed analytics about Heroes in Deadlock" },
  ];
};

export default function Heroes() {
  const [tab, setTab] = useState("synergies");

  return (
    <>
      <h2 className="text-3xl font-bold text-center mb-2">Hero Stats</h2>
      <p className="mb-4 text-gray-300 text-center text-sm italic">(Last 30 days)</p>

      <div className="text-sm font-medium text-center text-gray-500 border-b border-gray-200 dark:text-gray-400 dark:border-gray-700">
        <ul className="flex flex-wrap -mb-px">
          <li className="me-2">
            <button
              type="button"
              onClick={() => setTab("general")}
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
              onClick={() => setTab("synergies")}
              aria-current={tab === "synergies" ? "page" : undefined}
              className={
                tab === "synergies"
                  ? "inline-block p-4 text-blue-600 border-b-2 border-blue-600 rounded-t-lg active dark:text-blue-500 dark:border-blue-500"
                  : "inline-block p-4 border-b-2 border-transparent rounded-t-lg hover:text-gray-600 hover:border-gray-300 dark:hover:text-gray-300"
              }
            >
              Hero Synergies
            </button>
          </li>
        </ul>
      </div>

      {tab === "general" && (
        <div className="flex flex-col gap-4">
          <HeroStatsTable columns={["winRate", "pickRate", "KDA"]} sortBy="winrate" />
        </div>
      )}
      {tab === "synergies" && (
        <div className="flex flex-col gap-4">
          <HeroMatchupStatsTable />
        </div>
      )}
    </>
  );
}
