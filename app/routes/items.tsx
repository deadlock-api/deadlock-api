import dayjs, { type Dayjs } from "dayjs";
import { useState } from "react";
import type { MetaFunction } from "react-router";
import DatePicker from "~/components/primitives/DatePicker";
import HeroSelector from "~/components/selectors/HeroSelector";
import ItemStatsTable from "~/components/items-page/ItemStatsTable";
import RankSelector from "~/components/selectors/RankSelector";

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

  const initialStartDate = dayjs().subtract(30, "day").startOf("day");
  const initialEndDate = dayjs().subtract(1, "day").startOf("day");

  const [startDate, setStartDate] = useState<Dayjs | null>(initialStartDate);
  const [endDate, setEndDate] = useState<Dayjs | null>(initialEndDate);

  return (
    <>
      <h2 className="text-3xl font-bold text-center mb-2">Item Stats</h2>
      <div className="flex gap-4 justify-center items-center text-center p-6 mb-4 w-fit mx-auto rounded-lg bg-gray-800">
        <div className="flex flex-wrap justify-center sm:flex-nowrap gap-2">
          <HeroSelector onHeroSelected={setHero} selectedHero={hero} allowSelectNull={true} />
          <RankSelector onRankSelected={setMinRankId} selectedRank={minRankId} label="Minimum Rank" />
          <RankSelector onRankSelected={setMaxRankId} selectedRank={maxRankId} label="Maximum Rank" />
        </div>

        <div className="flex items-center gap-2.5">
          <DatePicker onDateSelected={setStartDate} selectedDate={startDate} label="Start Date" type="start" />
          <div className="mt-8">
            <span className="icon-[material-symbols--line-end-arrow-outline-rounded] text-gray-400 text-2xl" />
          </div>
          <DatePicker onDateSelected={setEndDate} selectedDate={endDate} label="End Date" type="end" />
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
