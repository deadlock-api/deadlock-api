import type { MetaFunction } from "@remix-run/node";
import ItemStatsTable from "~/components/item_stats_table";

export const meta: MetaFunction = () => {
  return [
    { title: "Items - Deadlock API" },
    { name: "description", content: "Detailed analytics about Items in Deadlock" },
  ];
};

export default function Items() {
  return (
    <>
      <h2 className="text-3xl font-bold text-center mb-2">Item Stats</h2>
      <p className="mb-4 text-gray-300 text-center text-sm italic">(Last 30 days)</p>
      <ItemStatsTable columns={["winRate", "usage"]} sortBy="winrate" />
    </>
  );
}
