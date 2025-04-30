import type { MetaFunction } from "@remix-run/node";
import { Link } from "@remix-run/react";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import HeroStatsTable from "~/components/hero_stats_table";
import ItemStatsTable from "~/components/item_stats_table";
import type { APIInfo } from "~/types/api_info";

export const meta: MetaFunction = () => {
  return [{ title: "Deadlock API" }, { name: "description", content: "Match Data, Player Data, and more" }];
};

export default function Index() {
  const { data } = useQuery<APIInfo>({
    queryKey: ["api-info"],
    queryFn: () => fetch("https://api.deadlock-api.com/v1/info").then((res) => res.json()),
    staleTime: 60 * 60 * 1000, // 1 hour
  });

  const totalFetchedMatches = useMemo(() => data?.table_sizes.match_info?.rows, [data]);

  return (
    <>
      <section>
        <h2 className="text-3xl font-bold text-center">Deadlock API</h2>
        {data && (
          <p className="mb-4 text-gray-300 text-center text-sm italic">
            Fetched Matches: {totalFetchedMatches?.toLocaleString()} (Last 24h:{" "}
            {data?.fetched_matches_per_day.toLocaleString()})
          </p>
        )}
        <p className="mb-4 text-gray-300 text-center">
          The Deadlock API provides a comprehensive set of endpoints to access game data, including match history,
          player statistics, and more. Whether you are a developer looking to integrate game data into your application
          or a player wanting to analyze your performance, the Deadlock API has you covered.
        </p>
        <div className="grid md:grid-cols-2 sm:grid-cols-1 gap-4">
          <div className="bg-gray-800 rounded-xl p-8 flex flex-col items-center shadow-lg border border-gray-700 transition-all duration-200 hover:scale-105 hover:shadow-2xl hover:border-blue-400 group cursor-pointer">
            <a
              href="https://assets.deadlock-api.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 underline text-lg font-semibold mb-3 group-hover:text-blue-300 transition-colors duration-200"
            >
              Assets API
            </a>
            <span className="text-gray-300 text-center text-base group-hover:text-white transition-colors duration-200">
              Provides static game assets such as static heroes/item data, images, icons, sounds.
            </span>
          </div>
          <div className="bg-gray-800 rounded-xl p-8 flex flex-col items-center shadow-lg border border-gray-700 transition-all duration-200 hover:scale-105 hover:shadow-2xl hover:border-blue-400 group cursor-pointer">
            <a
              href="https://api.deadlock-api.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 underline text-lg font-semibold mb-3 group-hover:text-blue-300 transition-colors duration-200"
            >
              Game Data API
            </a>
            <span className="text-gray-300 text-center text-base group-hover:text-white transition-colors duration-200">
              Offers game data including matches, players, and statistics.
            </span>
          </div>
        </div>
      </section>

      <hr className="my-8 border-gray-700" />

      <section className="grid md:grid-cols-2 gap-4 sm:grid-cols-1">
        <div className="bg-gray-800 rounded-2xl p-2 flex flex-col items-center shadow-2xl border-2 border-gray-700 min-w-80">
          <div className="flex justify-between my-2 items-center gap-2">
            <h3 className="text-lg font-bold text-center">Popular Heroes</h3>
            <p className="text-gray-300 text-center text-sm">(Last 30 days)</p>
          </div>
          <hr className="w-full border-gray-700 mb-2" />
          <HeroStatsTable hideIndex={true} hideHeader={true} limit={5} columns={["pickRate"]} sortBy="matches" />
          <Link to="/heroes">
            <button
              type="button"
              className="my-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded"
            >
              View All Heroes
            </button>
          </Link>
        </div>

        <div className="bg-gray-800 rounded-2xl p-2 flex flex-col items-center shadow-2xl border-2 border-gray-700 min-w-80">
          <div className="flex justify-between my-2 items-center gap-2">
            <h3 className="block text-lg font-bold text-center">Best Heroes</h3>
            <p className="block text-gray-300 text-center text-sm">(Last 30 days)</p>
          </div>
          <hr className="w-full border-gray-700 mb-2" />
          <HeroStatsTable hideIndex={true} hideHeader={true} limit={5} columns={["winRate"]} sortBy="winrate" />
          <Link to="/heroes">
            <button
              type="button"
              className="my-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded"
            >
              View All Heroes
            </button>
          </Link>
        </div>

        <div className="bg-gray-800 rounded-2xl p-2 flex flex-col items-center shadow-2xl border-2 border-gray-700 min-w-80">
          <div className="flex justify-between my-2 items-center gap-2">
            <h3 className="block text-lg font-bold text-center">Popular Items</h3>
            <p className="block text-gray-300 text-center text-sm">(Last 30 days)</p>
          </div>
          <hr className="w-full border-gray-700 mb-2" />
          <ItemStatsTable hideIndex={true} hideHeader={true} limit={5} columns={["usage"]} sortBy="matches" />
          <Link to="/items">
            <button
              type="button"
              className="my-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded"
            >
              View All Items
            </button>
          </Link>
        </div>

        <div className="bg-gray-800 rounded-2xl p-2 flex flex-col items-center shadow-2xl border-2 border-gray-700 min-w-80">
          <div className="flex justify-between my-2 items-center gap-2">
            <h3 className="block text-lg font-bold text-center">Best Items</h3>
            <p className="block text-gray-300 text-center text-sm">(Last 30 days)</p>
          </div>
          <hr className="w-full border-gray-700 mb-2" />
          <ItemStatsTable hideIndex={true} hideHeader={true} limit={5} columns={["winRate"]} sortBy="winrate" />
          <Link to="/items">
            <button
              type="button"
              className="my-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded"
            >
              View All Items
            </button>
          </Link>
        </div>
      </section>

      <hr className="my-8 border-gray-700" />

      <section>
        <p className="mb-4 text-gray-300 text-center text-balance">
          <a href="https://deadlock-api.com/" title="Deadlock API" className="underline text-blue-400">
            deadlock-api.com
          </a>{" "}
          is not endorsed by Valve and does not reflect the views or opinions of Valve or anyone officially involved in
          producing or managing Valve properties.
        </p>
      </section>
    </>
  );
}
