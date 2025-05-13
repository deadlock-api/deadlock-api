import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useState } from "react";
import { type MetaFunction, useLocation } from "react-router";
import ItemCombsExplore from "~/components/items-page/ItemCombsExplore";
import ItemStatsTable from "~/components/items-page/ItemStatsTable";
import { DateRangePicker } from "~/components/primitives/DateRangePicker";
import HeroSelector from "~/components/selectors/HeroSelector";
import RankSelector from "~/components/selectors/RankSelector";
import { Card, CardContent } from "~/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";

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

  const initialStartDate = dayjs().subtract(30, "day").startOf("day");
  const initialEndDate = dayjs().subtract(1, "day").startOf("day");

  const [startDate, setStartDate] = useState<Dayjs | null>(initialStartDate);
  const [endDate, setEndDate] = useState<Dayjs | null>(initialEndDate);

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
    setHero(searchHeroId || 15);
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

      <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="flex items-center justify-start flex-wrap h-auto w-full">
          <TabsTrigger value="stats">Overall Stats</TabsTrigger>
          <TabsTrigger value="item-combs">Item Combs</TabsTrigger>
        </TabsList>
        <TabsContent value="stats">
          <ItemStatsTable
            columns={["itemsTier", "winRate", "usage"]}
            sortBy="winrate"
            minRankId={minRankId}
            maxRankId={maxRankId}
            minDate={startDate || undefined}
            maxDate={endDate || undefined}
            hero={hero}
          />
        </TabsContent>
        <TabsContent value="item-combs">
          <ItemCombsExplore />
        </TabsContent>
      </Tabs>
    </>
  );
}
