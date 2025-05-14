import type { Dayjs } from "dayjs";
import { useState } from "react";
import type { MetaFunction } from "react-router";
import { PatchOrDatePicker } from "~/components/PatchOrDatePicker";
import ItemStatsTable from "~/components/items-page/ItemStatsTable";
import HeroSelector from "~/components/selectors/HeroSelector";
import RankSelector from "~/components/selectors/RankSelector";
import { Card, CardContent } from "~/components/ui/card";
import { PATCHES } from "~/lib/constants";

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

  const [startDate, setStartDate] = useState<Dayjs | null>(PATCHES[0].startDate);
  const [endDate, setEndDate] = useState<Dayjs | null>(PATCHES[0].endDate);

  return (
    <>
      <h2 className="text-3xl font-bold text-center mb-4">Item Stats</h2>
      <Card className="mb-4 w-fit mx-auto">
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 md:gap-8 justify-center md:justify-start">
            <div className="flex flex-wrap sm:flex-nowrap gap-2 justify-center md:justify-start">
              <HeroSelector onHeroSelected={setHero} selectedHero={hero} allowSelectNull={true} />
              <RankSelector onRankSelected={setMinRankId} selectedRank={minRankId} label="Minimum Rank" />
              <RankSelector onRankSelected={setMaxRankId} selectedRank={maxRankId} label="Maximum Rank" />
            </div>
            <div className="flex justify-center md:justify-start">
              <PatchOrDatePicker
                patchDates={PATCHES}
                value={{ startDate, endDate }}
                onValueChange={({ startDate, endDate }) => {
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
