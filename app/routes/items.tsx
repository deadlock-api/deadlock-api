import { useEffect, useState } from "react";
import { type MetaFunction, useLocation } from "react-router";
import { PatchOrDatePicker } from "~/components/PatchOrDatePicker";
import ItemCombsExplore from "~/components/items-page/ItemCombsExplore";
import ItemStatsTable from "~/components/items-page/ItemStatsTable";
import HeroSelector from "~/components/selectors/HeroSelector";
import RankSelector from "~/components/selectors/RankSelector";
import { Card, CardContent } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import type { Dayjs } from "~/dayjs";
import { PATCHES } from "~/lib/constants";

export const meta: MetaFunction = () => {
  return [
    { title: "Items - Deadlock API" },
    { name: "description", content: "Detailed analytics about Items in Deadlock" },
  ];
};

export default function Items({ initialTab }: { initialTab?: string } = { initialTab: "stats" }) {
  const [minRankId, setMinRankId] = useState<number>(0);
  const [maxRankId, setMaxRankId] = useState<number>(116);
  const [hero, setHero] = useState<number | null>(null);
  const [minMatches, setMinMatches] = useState<number>(10);

  const [startDate, setStartDate] = useState<Dayjs | null>(PATCHES[0].startDate);
  const [endDate, setEndDate] = useState<Dayjs | null>(PATCHES[0].endDate);

  const location = useLocation();
  const [searchParams, setSearchParams] = useState<URLSearchParams | null>(new URLSearchParams(location.search));
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setSearchParams(params);

    const searchTab = params?.get("tab") || initialTab || "stats";
    if (searchTab) {
      setTab(searchTab);
    }

    const searchHeroIdString = params?.get("heroId");
    const searchHeroId = searchHeroIdString ? Number.parseInt(searchHeroIdString) : null;
    if (searchHeroId) setHero(searchHeroId);
  }, [location.search, initialTab]);

  const searchTab = searchParams?.get("tab");
  const [tab, setTab] = useState(searchTab || initialTab || "stats");

  const handleTabChange = (newTab: string) => {
    setTab(newTab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", newTab);
      window.history.pushState({}, "", url);
    }
  };

  return (
    <>
      <h2 className="text-3xl font-bold text-center mb-4">Item Stats</h2>
      <Card className="mb-4 w-fit mx-auto">
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 md:gap-8 justify-center md:justify-start">
            <div className="flex flex-wrap sm:flex-nowrap gap-2 justify-center md:justify-start">
              <HeroSelector onHeroSelected={setHero} selectedHero={hero} allowSelectNull={true} />
              <div className="flex flex-col min-w-24 max-w-sm gap-1.5">
                <Label htmlFor="minMatches" className="h-8">
                  Min Matches
                </Label>
                <Input
                  type="number"
                  id="minMatches"
                  min={1}
                  step={10}
                  value={minMatches}
                  onChange={(e) => setMinMatches(Number(e.target.value))}
                />
              </div>
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

      <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="flex items-center justify-start flex-wrap h-auto w-full">
          <TabsTrigger value="stats">Overall Stats</TabsTrigger>
          <TabsTrigger value="item-combs">Item Combination Stats</TabsTrigger>
        </TabsList>
        <TabsContent value="stats">
          <ItemStatsTable
            columns={["itemsTier", "winRate", "usage"]}
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
