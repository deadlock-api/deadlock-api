import { parseAsArrayOf, parseAsBoolean, parseAsInteger, parseAsStringLiteral, useQueryState } from "nuqs";
import { useId } from "react";
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
import NumberSelector from "~/components/NumberSelector";
import { PatchOrDatePicker } from "~/components/PatchOrDatePicker";
import HeroSelector, { HeroSelectorMultiple } from "~/components/selectors/HeroSelector";
import RankSelector from "~/components/selectors/RankSelector";
import { Card, CardContent } from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { PATCHES } from "~/lib/constants";
import { parseAsDayjsRange } from "~/lib/nuqs-parsers";
import { HERO_STATS } from "~/types/api_hero_stats";

export const meta: MetaFunction = () => {
  return [
    { title: "Heroes - Deadlock API" },
    { name: "description", content: "Detailed analytics about Heroes in Deadlock" },
  ];
};
export default function Heroes(
  { initialTab }: { initialTab?: "stats" | "stats-over-time" | "matchups" | "hero-combs" | "hero-matchup-details" } = {
    initialTab: "stats",
  },
) {
  const [minMatches, setMinMatches] = useQueryState("min_matches", parseAsInteger.withDefault(10));
  const [minHeroMatches, setMinHeroMatches] = useQueryState("min_hero_matches", parseAsInteger.withDefault(0));
  const [minHeroMatchesTotal, setMinHeroMatchesTotal] = useQueryState(
    "min_hero_matches_total",
    parseAsInteger.withDefault(0),
  );
  const [minRankId, setMinRankId] = useQueryState("min_rank", parseAsInteger.withDefault(91));
  const [maxRankId, setMaxRankId] = useQueryState("max_rank", parseAsInteger.withDefault(116));
  const [sameLaneFilter, setSameLaneFilter] = useQueryState("same_lane", parseAsBoolean.withDefault(true));
  const [samePartyFilter, setSamePartyFilter] = useQueryState("same_party", parseAsBoolean.withDefault(false));
  const sameLaneFilterId1 = useId();
  const samePartyFilterId1 = useId();
  const sameLaneFilterId2 = useId();
  const samePartyFilterId2 = useId();
  const [[startDate, endDate], setDateRange] = useQueryState(
    "date_range",
    parseAsDayjsRange.withDefault([PATCHES[0].startDate, PATCHES[0].endDate]),
  );
  const [tab, setTab] = useQueryState(
    "tab",
    parseAsStringLiteral([
      "stats",
      "stats-over-time",
      "matchups",
      "hero-combs",
      "hero-matchup-details",
    ] as const).withDefault(initialTab || "stats"),
  );
  const [heroId, setHeroId] = useQueryState("hero_id", parseAsInteger.withDefault(7));
  const [heroIds, setHeroIds] = useQueryState("hero_ids", parseAsArrayOf(parseAsInteger).withDefault([15]));
  const [heroStat, setHeroStat] = useQueryState("hero_stat", parseAsStringLiteral(HERO_STATS).withDefault("winrate"));
  const [heroTimeInterval, setHeroTimeInterval] = useQueryState(
    "time_interval",
    parseAsStringLiteral(["start_time_hour", "start_time_day", "start_time_week"] as const).withDefault(
      "start_time_day",
    ),
  );

  return (
    <>
      <h2 className="text-3xl font-bold text-center mb-2">Hero Stats</h2>

      <Card className="mb-8 w-fit mx-auto">
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 md:gap-8 justify-center md:justify-start text-center">
            <div className="flex flex-wrap justify-center sm:flex-nowrap gap-2">
              {["stats", "stats-over-time"].includes(tab) ? (
                <>
                  <NumberSelector
                    value={minHeroMatches}
                    onChange={setMinHeroMatches}
                    label={"Min Hero Matches (Timerange)"}
                    step={10}
                  />
                  <NumberSelector
                    value={minHeroMatchesTotal}
                    onChange={setMinHeroMatchesTotal}
                    label={"Min Hero Matches (Total)"}
                    step={100}
                  />
                </>
              ) : (
                <NumberSelector value={minMatches} onChange={setMinMatches} label={"Min Matches (Total)"} step={10} />
              )}
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

      <Tabs value={tab ?? undefined} onValueChange={(value) => setTab(value as typeof tab)} className="w-full">
        <TabsList className="flex items-center flex-wrap h-auto w-full">
          <TabsTrigger className="flex-1" value="stats">
            Overall Stats
          </TabsTrigger>
          <TabsTrigger className="flex-1" value="stats-over-time">
            Stats Over Time
          </TabsTrigger>
          <TabsTrigger className="flex-1" value="matchups">
            Matchups
          </TabsTrigger>
          <TabsTrigger className="flex-1" value="hero-combs">
            Hero Combs
          </TabsTrigger>
          <TabsTrigger className="flex-1" value="hero-matchup-details">
            Matchup Details
          </TabsTrigger>
        </TabsList>

        <TabsContent value="stats">
          <div className="flex flex-col gap-4">
            <HeroStatsTable
              columns={["winRate", "pickRate", "KDA", "totalMatches"]}
              sortBy="winrate"
              minRankId={minRankId}
              maxRankId={maxRankId}
              minHeroMatches={minHeroMatches}
              minHeroMatchesTotal={minHeroMatchesTotal}
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
                  }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm text-muted-foreground">Stat</span>
                <HeroStatSelector
                  value={heroStat as (typeof HERO_STATS)[number]}
                  onChange={(val) => setHeroStat(val as typeof heroStat)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm text-muted-foreground">Time Interval</span>
                <HeroTimeIntervalSelector
                  value={heroTimeInterval ?? undefined}
                  onChange={(val) => setHeroTimeInterval(val as typeof heroTimeInterval)}
                />
              </div>
            </div>
            <HeroStatsOverTimeChart
              heroIds={heroIds}
              heroStat={heroStat as (typeof HERO_STATS)[number]}
              heroTimeInterval={heroTimeInterval}
              minRankId={minRankId}
              maxRankId={maxRankId}
              minHeroMatches={minHeroMatches}
              minHeroMatchesTotal={minHeroMatchesTotal}
              minDate={startDate}
              maxDate={endDate}
            />
          </div>
        </TabsContent>

        <TabsContent value="matchups">
          <div className="flex flex-col gap-4 mt-4">
            <div className="flex flex-wrap justify-center items-center sm:flex-nowrap gap-8">
              <div className="flex items-center gap-2">
                <Label htmlFor={sameLaneFilterId1} className="text-sm font-semibold text-foreground text-nowrap">
                  Same Lane Filter
                </Label>
                <Checkbox
                  id={sameLaneFilterId1}
                  checked={sameLaneFilter}
                  onCheckedChange={(i) => setSameLaneFilter(i === true)}
                />
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor={samePartyFilterId1} className="text-sm font-semibold text-foreground text-nowrap">
                  Same Party Filter
                </Label>
                <Checkbox
                  id={samePartyFilterId1}
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
                minMatches={minMatches}
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
              minMatches={minMatches}
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
                }}
              />
              <div className="flex flex-col flex-wrap items-center sm:flex-nowrap gap-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor={sameLaneFilterId2} className="text-sm font-semibold text-foreground text-nowrap">
                    Same Lane Filter
                  </Label>
                  <Checkbox
                    id={sameLaneFilterId2}
                    checked={sameLaneFilter}
                    onCheckedChange={(i) => setSameLaneFilter(i === true)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor={samePartyFilterId2} className="text-sm font-semibold text-foreground text-nowrap">
                    Same Party Filter
                  </Label>
                  <Checkbox
                    id={samePartyFilterId2}
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
                }}
                sameLaneFilter={sameLaneFilter}
                samePartyFilter={samePartyFilter}
                minHeroMatches={minMatches}
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
                }}
                sameLaneFilter={sameLaneFilter}
                samePartyFilter={samePartyFilter}
                minHeroMatches={minMatches}
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
