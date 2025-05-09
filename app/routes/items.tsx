import { useState } from "react";
import DatePicker from "react-datepicker";
import type { MetaFunction } from "react-router";
import HeroSelector from "~/components/hero_selector";
import ItemStatsTable from "~/components/item_stats_table";
import RankSelector from "~/components/rank_selector";

export const meta: MetaFunction = () => {
  return [
    { title: "Items - Deadlock API" },
    { name: "description", content: "Detailed analytics about Items in Deadlock" },
  ];
};

export default function Items() {
  const [minRankId, setMinRankId] = useState<number>(0);
  const [maxRankId, setMaxRankId] = useState<number>(116);
  const [hero, setHero] = useState<number | null>(null);

  const initialStartDate = new Date();
  initialStartDate.setDate(initialStartDate.getDate() - 30);
  initialStartDate.setUTCHours(0, 0, 0, 0);

  const initialEndDate = new Date();
  initialEndDate.setUTCHours(0, 0, 0, 0);

  const [startDate, setStartDate] = useState<Date | null>(initialStartDate);
  const [endDate, setEndDate] = useState<Date | null>(initialEndDate);

  return (
    <>
      <h2 className="text-3xl font-bold text-center mb-2">Item Stats</h2>
      <p className="mb-4 text-gray-300 text-center text-sm italic">(Last 30 days)</p>
      <div className="flex flex-wrap gap-8 justify-center items-center text-center p-2 mb-4 w-fit mx-auto rounded-lg bg-gray-800">
        <div className="flex flex-wrap justify-center sm:flex-nowrap gap-2">
          <HeroSelector onHeroSelected={setHero} selectedHero={hero} allowSelectNull={true} />
          <RankSelector onRankSelected={setMinRankId} selectedRank={minRankId} label="Minimum Rank" />
          <RankSelector onRankSelected={setMaxRankId} selectedRank={maxRankId} label="Maximum Rank" />
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex flex-col items-center justify-around h-full">
            <p className="block mb-2 text-sm font-medium text-white">Start Date</p>
            <div className="border text-sm rounded-lg block w-full py-1.5 bg-gray-700 border-gray-600 placeholder-gray-400 text-white">
              <DatePicker selected={startDate} onChange={(date) => setStartDate(date)} />
            </div>
          </div>

          <div className="mt-8">
            <span className="icon-[material-symbols--line-end-arrow-outline-rounded] text-gray-400 text-2xl" />
          </div>

          <div className="flex flex-col items-center justify-around h-full">
            <p className="block mb-2 text-sm font-medium text-white">End Date</p>
            <div className="border text-sm rounded-lg block w-full py-1.5 bg-gray-700 border-gray-600 placeholder-gray-400 text-white">
              <DatePicker selected={endDate} onChange={(date) => setEndDate(date)} />
            </div>
          </div>
        </div>
      </div>
      <ItemStatsTable
        columns={["itemsTier", "winRate", "usage"]}
        sortBy="winrate"
        minRankId={minRankId}
        maxRankId={maxRankId}
        minDate={startDate || undefined}
        maxDate={endDate || undefined}
        hero={hero}
      />
    </>
  );
}
