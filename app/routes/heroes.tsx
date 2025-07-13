import type { MetaFunction } from "react-router";
import HeroCombStatsTable from "~/components/heroes-page/HeroCombStatsTable";
import HeroMatchupDetailsStatsTable, {
  HeroMatchupDetailsStatsTableStat,
} from "~/components/heroes-page/HeroMatchupDetailsStatsTable";
import HeroMatchupStatsTable from "~/components/heroes-page/HeroMatchupStatsTable";
import HeroStatsOverTimeChart, {
  HeroStatSelector,
  HeroTimeIntervalSelector,
} from "~/components/heroes-page/HeroStatsOverTimeChart";
import HeroStatsTable from "~/components/heroes-page/HeroStatsTable";
import { PatchOrDatePicker } from "~/components/PatchOrDatePicker";
import HeroSelector, { HeroSelectorMultiple } from "~/components/selectors/HeroSelector";
import RankSelector from "~/components/selectors/RankSelector";
import { Card, CardContent } from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { serializers, useQSArray, useQSBoolean, useQSDayjsRange, useQSNumber, useQSString } from "~/hooks/useQSState";
import { PATCHES } from "~/lib/constants";
import type { HERO_STATS } from "~/types/api_hero_stats";

export const meta: MetaFunction = () => {
  return [
    { title: "Heroes - Deadlock API" },
    { name: "description", content: "Detailed analytics about Heroes in Deadlock" },
  ];
};
export default function Heroes({ initialTab }: { initialTab?: string } = { initialTab: "stats" }) {
  const [minRankId, setMinRankId] = useQSNumber("min_rank", 91);
  const [maxRankId, setMaxRankId] = useQSNumber("max_rank", 116);
  const [sameLaneFilter, setSameLaneFilter] = useQSBoolean("same_lane", true);
  const [samePartyFilter, setSamePartyFilter] = useQSBoolean("same_party", true);
  const [[startDate, endDate], setDateRange] = useQSDayjsRange("date_range", [
    PATCHES[0].startDate,
    PATCHES[0].endDate,
  ]);
  const [tab, setTab] = useQSString("tab", initialTab || "stats");
  const [heroId, setHeroId] = useQSNumber("hero_id", 7);
  const [heroIds, setHeroIds] = useQSArray("hero_ids", serializers.number, [15]);
  const [heroStat, setHeroStat] = useQSString<(typeof HERO_STATS)[number]>("hero_stat", "winrate");
  const [heroTimeInterval, setHeroTimeInterval] = useQSString<string>("time_interval", "start_time_day");

  return (
    <>
      <h2 className="text-3xl font-bold text-center mb-2">Hero Stats</h2>

      <Card className="mb-8 w-fit mx-auto">
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 md:gap-8 justify-center md:justify-start text-center">
            <div className="flex flex-wrap justify-center sm:flex-nowrap gap-2">
              <RankSelector onRankSelected={setMinRankId} selectedRank={minRankId} label="Minimum Rank" />
              <RankSelector onRankSelected={setMaxRankId} selectedRank={maxRankId} label="Maximum Rank" />
            </div>

            <div className="flex justify-center md:justify-start">
              <PatchOrDatePicker
                patchDates={PATCHES}
                value={{ startDate, endDate }}
                onValueChange={({ startDate, endDate }) => setDateRange([startDate, endDate])}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="flex items-center justify-start flex-wrap h-auto w-full">
          <TabsTrigger value="stats">Overall Stats</TabsTrigger>
          <TabsTrigger value="stats-over-time">Stats Over Time</TabsTrigger>
          <TabsTrigger value="matchups">Matchups</TabsTrigger>
          <TabsTrigger value="hero-combs">Hero Combs</TabsTrigger>
          <TabsTrigger value="hero-matchup-details">Matchup Details</TabsTrigger>
        </TabsList>

        <TabsContent value="stats">
          <div className="flex flex-col gap-4">
            <HeroStatsTable
              columns={["winRate", "pickRate", "KDA", "totalMatches"]}
              sortBy="winrate"
              minRankId={minRankId}
              maxRankId={maxRankId}
              minDate={startDate || undefined}
              maxDate={endDate || undefined}
              fullWidth
            />
          </div>
        </TabsContent>

        <TabsContent value="stats-over-time">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap justify-center sm:flex-nowrap gap-2">
              <div className="flex flex-col gap-1.5">
                <span className="text-sm text-muted-foreground">Heroes</span>
                <HeroSelectorMultiple
                  selectedHeroes={heroIds}
                  onHeroesSelected={(selectedHeroIds) => {
                    if (!selectedHeroIds) return;
                    setHeroIds(selectedHeroIds);
                    if (typeof window !== "undefined") {
                      const url = new URL(window.location.href);
                      url.searchParams.set("heroIds", selectedHeroIds.join(","));
                      window.history.pushState({}, "", url);
                    }
                  }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm text-muted-foreground">Stat</span>
                <HeroStatSelector value={heroStat as (typeof HERO_STATS)[number]} onChange={setHeroStat} />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm text-muted-foreground">Time Interval</span>
                <HeroTimeIntervalSelector value={heroTimeInterval} onChange={setHeroTimeInterval} />
              </div>
            </div>
            <HeroStatsOverTimeChart
              heroIds={heroIds}
              heroStat={heroStat as (typeof HERO_STATS)[number]}
              heroTimeInterval={heroTimeInterval}
              minRankId={minRankId}
              maxRankId={maxRankId}
              minDate={startDate}
              maxDate={endDate}
            />
          </div>
        </TabsContent>

        <TabsContent value="matchups">
          <div className="flex flex-col gap-4 mt-4">
            <div className="flex flex-wrap justify-center items-center sm:flex-nowrap gap-8">
              <div className="flex items-center gap-2">
                <label htmlFor="same-lane-filter" className="text-sm font-semibold text-foreground text-nowrap">
                  Same Lane Filter
                </label>
                <Checkbox
                  id="same-lane-filter"
                  checked={sameLaneFilter}
                  onCheckedChange={(i) => setSameLaneFilter(i === true)}
                />
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="same-party-filter" className="text-sm font-semibold text-foreground text-nowrap">
                  Same Party Filter
                </label>
                <Checkbox
                  id="same-party-filter"
                  checked={samePartyFilter}
                  onCheckedChange={(i) => setSamePartyFilter(i === true)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <HeroMatchupStatsTable
                minRankId={minRankId}
                maxRankId={maxRankId}
                minDate={startDate || undefined}
                maxDate={endDate || undefined}
                sameLaneFilter={sameLaneFilter}
                samePartyFilter={samePartyFilter}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="hero-combs">
          <div className="flex flex-col gap-4">
            <HeroCombStatsTable
              columns={["winRate", "pickRate", "totalMatches"]}
              minRankId={minRankId}
              maxRankId={maxRankId}
              minDate={startDate || undefined}
              maxDate={endDate || undefined}
            />
          </div>
        </TabsContent>

        <TabsContent value="hero-matchup-details">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap justify-center items-center sm:flex-nowrap gap-8">
              <HeroSelector
                selectedHero={heroId}
                onHeroSelected={(selectedHeroId) => {
                  if (!selectedHeroId) return;
                  setHeroId(selectedHeroId);
                  if (typeof window !== "undefined") {
                    const url = new URL(window.location.href);
                    url.searchParams.set("heroId", selectedHeroId.toString());
                    window.history.pushState({}, "", url);
                  }
                }}
              />
              <div className="flex flex-col flex-wrap items-center sm:flex-nowrap gap-2">
                <div className="flex items-center gap-2">
                  <label htmlFor="same-lane-filter" className="text-sm font-semibold text-foreground text-nowrap">
                    Same Lane Filter
                  </label>
                  <Checkbox
                    id="same-lane-filter"
                    checked={sameLaneFilter}
                    onCheckedChange={(i) => setSameLaneFilter(i === true)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="same-party-filter" className="text-sm font-semibold text-foreground text-nowrap">
                    Same Party Filter
                  </label>
                  <Checkbox
                    id="same-party-filter"
                    checked={samePartyFilter}
                    onCheckedChange={(i) => setSamePartyFilter(i === true)}
                  />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <HeroMatchupDetailsStatsTable
                heroId={heroId}
                stat={HeroMatchupDetailsStatsTableStat.SYNERGY}
                minRankId={minRankId}
                maxRankId={maxRankId}
                minDate={startDate || undefined}
                maxDate={endDate || undefined}
                onHeroSelected={(selectedHeroId) => {
                  if (!selectedHeroId) return;
                  setHeroId(selectedHeroId);
                  if (typeof window !== "undefined") {
                    const url = new URL(window.location.href);
                    url.searchParams.set("heroId", selectedHeroId.toString());
                    window.history.pushState({}, "", url);
                  }
                }}
                sameLaneFilter={sameLaneFilter}
                samePartyFilter={samePartyFilter}
              />
              <HeroMatchupDetailsStatsTable
                heroId={heroId}
                stat={HeroMatchupDetailsStatsTableStat.COUNTER}
                minRankId={minRankId}
                maxRankId={maxRankId}
                minDate={startDate || undefined}
                maxDate={endDate || undefined}
                onHeroSelected={(selectedHeroId) => {
                  if (!selectedHeroId) return;
                  setHeroId(selectedHeroId);
                  if (typeof window !== "undefined") {
                    const url = new URL(window.location.href);
                    url.searchParams.set("heroId", selectedHeroId.toString());
                    window.history.pushState({}, "", url);
                  }
                }}
                sameLaneFilter={sameLaneFilter}
                samePartyFilter={samePartyFilter}
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
