import dayjs, { type Dayjs } from "dayjs";
import { useState } from "react";
import type { MetaFunction } from "react-router";
import ItemStatsTable from "~/components/items-page/ItemStatsTable";
import { DateRangePicker } from "~/components/primitives/DateRangePicker";
import HeroSelector from "~/components/selectors/HeroSelector";
import RankSelector from "~/components/selectors/RankSelector";
import { Card, CardContent } from "~/components/ui/card";

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

  const initialStartDate = dayjs().subtract(7, "day").startOf("day");
  const initialEndDate = dayjs().startOf("day");

  const [startDate, setStartDate] = useState<Dayjs | null>(initialStartDate);
  const [endDate, setEndDate] = useState<Dayjs | null>(initialEndDate);

  return (
    <>
      <h2 className="text-3xl font-bold text-center mb-4">Item Stats</h2>
      <Card className="mb-4 w-fit mx-auto">
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 md:gap-8 justify-center items-center text-center">
            <div className="flex flex-wrap justify-center sm:flex-nowrap gap-2">
              <HeroSelector onHeroSelected={setHero} selectedHero={hero} allowSelectNull={true} />
              <RankSelector onRankSelected={setMinRankId} selectedRank={minRankId} label="Minimum Rank" />
              <RankSelector onRankSelected={setMaxRankId} selectedRank={maxRankId} label="Maximum Rank" />
            </div>
            <div className="flex items-center justify-center">
              <DateRangePicker
                startDate={startDate}
                endDate={endDate}
                onDateRangeChange={({ startDate, endDate }) => {
                  setStartDate(startDate);
                  setEndDate(endDate);
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

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
