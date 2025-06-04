import type { MetaFunction } from "react-router";
import { PatchOrDatePicker } from "~/components/PatchOrDatePicker";
import ItemCombsExplore from "~/components/items-page/ItemCombsExplore";
import ItemStatsTable from "~/components/items-page/ItemStatsTable";
import HeroSelector from "~/components/selectors/HeroSelector";
import RankSelector from "~/components/selectors/RankSelector";
import { Card, CardContent } from "~/components/ui/card";
import { Label } from "~/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { useQSDayjs, useQSNumber, useQSString } from "~/hooks/useQSState";
import { PATCHES } from "~/lib/constants";

export const meta: MetaFunction = () => {
  return [
    { title: "Items - Deadlock API" },
    { name: "description", content: "Detailed analytics about Items in Deadlock" },
  ];
};

export default function Items({ initialTab }: { initialTab?: string } = { initialTab: "stats" }) {
  const [minRankId, setMinRankId] = useQSNumber("min_rank", 0);
  const [maxRankId, setMaxRankId] = useQSNumber("max_rank", 116);
  const [hero, setHero] = useQSNumber("hero");
  const [minMatches, setMinMatches] = useQSNumber("min_matches", 20);
  const [startDate, setStartDate] = useQSDayjs("start_date", PATCHES[0].startDate);
  const [endDate, setEndDate] = useQSDayjs("end_date", PATCHES[0].endDate);
  const [tab, setTab] = useQSString("tab", initialTab || "stats");

  return (
    <>
      <h2 className="text-3xl font-bold text-center mb-4">Item Stats</h2>
      <Card className="mb-4 w-fit mx-auto">
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 md:gap-8 justify-center md:justify-start">
            <div className="flex flex-wrap sm:flex-nowrap gap-2 justify-center md:justify-start">
              <HeroSelector
                onHeroSelected={(x) => setHero(x || undefined)}
                selectedHero={hero}
                allowSelectNull={true}
              />
              <div className="flex flex-col min-w-24 max-w-sm gap-1.5">
                <Label htmlFor="minMatches" className="h-8">
                  Min Matches
                </Label>
                <div className="flex items-center border rounded-md px-2 py-1 bg-transparent min-w-0 h-9 w-full md:text-sm focus-within:ring-2 focus-within:ring-ring/50 focus-within:border-ring">
                  <button
                    type="button"
                    aria-label="Decrease min matches"
                    className="px-2 text-lg font-bold text-muted-foreground hover:text-foreground focus:outline-none"
                    onClick={() => setMinMatches(Math.max(1, minMatches - 10))}
                  >
                    -
                  </button>
                  <span className="flex-1 text-center select-none" style={{ minWidth: 32 }}>
                    {minMatches}
                  </span>
                  <button
                    type="button"
                    aria-label="Increase min matches"
                    className="px-2 text-lg font-bold text-muted-foreground hover:text-foreground focus:outline-none"
                    onClick={() => setMinMatches(minMatches + 10)}
                  >
                    +
                  </button>
                </div>
              </div>
              <RankSelector onRankSelected={setMinRankId} selectedRank={minRankId} label="Minimum Rank" />
              <RankSelector onRankSelected={setMaxRankId} selectedRank={maxRankId} label="Maximum Rank" />
            </div>
            <div className="flex justify-center md:justify-start">
              <PatchOrDatePicker
                patchDates={PATCHES}
                value={{ startDate, endDate }}
                onValueChange={({ startDate, endDate }) => {
                  setStartDate(startDate || undefined);
                  setEndDate(endDate || undefined);
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="flex items-center justify-start flex-wrap h-auto w-full">
          <TabsTrigger value="stats">Overall Stats</TabsTrigger>
          <TabsTrigger value="item-combs">Item Combination Stats</TabsTrigger>
        </TabsList>
        <TabsContent value="stats">
          <ItemStatsTable
            columns={["itemsTier", "winRate", "usage", "confidence"]}
            initialSort={{ field: "winRate", direction: "desc" }}
            minRankId={minRankId}
            maxRankId={maxRankId}
            minDate={startDate || undefined}
            maxDate={endDate || undefined}
            hero={hero}
            minMatches={minMatches}
          />
        </TabsContent>
        <TabsContent value="item-combs">
          <ItemCombsExplore
            sortBy="winrate"
            minRankId={minRankId}
            maxRankId={maxRankId}
            minDate={startDate || undefined}
            maxDate={endDate || undefined}
            hero={hero}
            minMatches={minMatches}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
