import { Button } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { MetaFunction } from "react-router";
import { Link } from "react-router";
import HeroStatsTable from "~/components/heroes-page/HeroStatsTable";
import ItemStatsTable from "~/components/items-page/ItemStatsTable";
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
        <div className=" border border-gray-700 rounded-xl p-4">
          <h3 className="text-xl font-bold text-center mb-4">Services</h3>
          <div className="grid xl:grid-cols-4 lg:grid-cols-2 sm:grid-cols-1 gap-4">
            <a
              href="https://assets.deadlock-api.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-gray-800 rounded-xl p-8 flex flex-col items-center shadow-lg border border-gray-700 hover:scale-105 hover:shadow-2xl hover:border-blue-400 text-center transition-colors duration-200"
            >
              <p className=" text-blue-400 underline text-lg font-semibold mb-3">Assets API</p>
              <span className="text-gray-300 text-balance text-base">
                Provides static game assets such as static heroes/item data, images, icons, sounds.
              </span>
            </a>
            <a
              href="https://api.deadlock-api.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-gray-800 rounded-xl p-8 flex flex-col items-center shadow-lg border border-gray-700 hover:scale-105 hover:shadow-2xl hover:border-blue-400 text-center transition-colors duration-200"
            >
              <p className="text-blue-400 underline text-lg font-semibold mb-3">Game Data API</p>
              <span className="text-gray-300 text-balance text-base">
                Offers game data including matches, players, and statistics.
              </span>
            </a>
            <a
              href="https://minio.deadlock-api.com/browser/db-snapshot/public%2F"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-gray-800 rounded-xl p-8 flex flex-col items-center shadow-lg border border-gray-700 hover:scale-105 hover:shadow-2xl hover:border-blue-400 text-center transition-colors duration-200"
            >
              <p className="text-blue-400 underline text-lg font-semibold mb-3">Database Dumps</p>
              <span className="text-gray-300 text-balance text-base">
                Download up-to-date database snapshots for offline analysis or research.
              </span>
            </a>
            <a
              href="https://streamkit.deadlock-api.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-gray-800 rounded-xl p-8 flex flex-col items-center shadow-lg border border-gray-700 hover:scale-105 hover:shadow-2xl hover:border-blue-400 text-center transition-colors duration-200"
            >
              <p className="text-blue-400 underline text-lg font-semibold mb-3">Streamkit</p>
              <span className="text-gray-300 text-balance text-base">
                Tools for Streamers, including custom commands and customizable overlays.
              </span>
            </a>
          </div>
        </div>
      </section>

      <hr className="my-8 border-gray-700" />

      <section className="grid gap-4 lg:grid-cols-3 sm:grid-cols-2">
        <div className="bg-gray-800 rounded-2xl p-2 flex flex-col items-center shadow-2xl border-2 border-gray-700 min-w-80 space-y-4">
          <div className="flex justify-between my-2 items-center gap-2">
            <h3 className="text-lg font-bold text-center">Popular Heroes</h3>
            <p className="text-gray-300 text-center text-sm">(Last 30 days)</p>
          </div>
          <hr className="w-full border-gray-700 mb-2" />
          <HeroStatsTable hideIndex={true} hideHeader={true} limit={5} columns={["pickRate"]} sortBy="matches" />
          <Link to="/heroes">
            <Button variant="contained">View All Heroes</Button>
          </Link>
        </div>

        <div className="bg-gray-800 rounded-2xl p-2 flex flex-col items-center shadow-2xl border-2 border-gray-700 min-w-80 space-y-4">
          <div className="flex justify-between my-2 items-center gap-2">
            <h3 className="block text-lg font-bold text-center">Best Heroes</h3>
            <p className="block text-gray-300 text-center text-sm">(Last 30 days)</p>
          </div>
          <hr className="w-full border-gray-700 mb-2" />
          <HeroStatsTable hideIndex={true} hideHeader={true} limit={5} columns={["winRate"]} sortBy="winrate" />
          <Link to="/heroes">
            <Button variant="contained">View All Heroes</Button>
          </Link>
        </div>

        <div className="bg-gray-800 rounded-2xl p-2 flex flex-col items-center shadow-2xl border-2 border-gray-700 min-w-80 space-y-4">
          <div className="flex justify-between my-2 items-center gap-2">
            <h3 className="block text-lg font-bold text-center">Popular Items</h3>
            <p className="block text-gray-300 text-center text-sm">(Last 30 days)</p>
          </div>
          <hr className="w-full border-gray-700 mb-2" />
          <ItemStatsTable hideIndex={true} hideHeader={true} limit={5} columns={["usage"]} sortBy="matches" />
          <Link to="/items">
            <Button variant="contained">View All Items</Button>
          </Link>
        </div>

        <div className="bg-gray-800 rounded-2xl p-2 flex flex-col items-center shadow-2xl border-2 border-gray-700 min-w-80 space-y-4">
          <div className="flex justify-between my-2 items-center gap-2">
            <h3 className="block text-lg font-bold text-center">Best Items</h3>
            <p className="block text-gray-300 text-center text-sm">(Last 30 days)</p>
          </div>
          <hr className="w-full border-gray-700 mb-2" />
          <ItemStatsTable hideIndex={true} hideHeader={true} limit={5} columns={["winRate"]} sortBy="winrate" />
          <Link to="/items">
            <Button variant="contained">View All Items</Button>
          </Link>
        </div>
      </section>

      <hr className="my-8 border-gray-700" />

      <section>
        <h2 className="text-3xl font-bold text-center">Sponsors</h2>
        <p className="mb-6 text-sm text-gray-300 text-center">
          We are grateful to our sponsors for their support. <br />
          Please check out our{" "}
          <a
            href="https://www.patreon.com/user?u=68961896"
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-blue-400"
            title="Support on Patreon"
          >
            Patreon
          </a>
          .
        </p>
        <div className="flex flex-wrap justify-around items-center gap-4 m-4">
          <a href="https://deadlock.blast.tv/" title="Blast.TV" target="_blank" rel="noreferrer" className="max-w-64">
            <img src="logo/blast.svg" alt="https://deadlock.blast.tv/" />
          </a>
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
