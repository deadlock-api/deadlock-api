import type { MetaFunction } from "@remix-run/node";
import HeroStatsTable from "~/components/hero_stats_table";

export const meta: MetaFunction = () => {
  return [
    { title: "Heroes - Deadlock API" },
    { name: "description", content: "Detailed analytics about Heroes in Deadlock" },
  ];
};

export default function Heroes() {
  return (
    <>
      <h2 className="text-3xl font-bold text-center mb-2">Hero Stats</h2>
      <p className="mb-4 text-gray-300 text-center text-sm italic">(Last 30 days)</p>
      <HeroStatsTable columns={["winRate", "pickRate", "KDA"]} sortBy="winrate" />
    </>
  );
}
