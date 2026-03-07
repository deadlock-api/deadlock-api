import { parseAsInteger, parseAsStringLiteral, useQueryState } from "nuqs";
import type { MetaFunction } from "react-router";
import ItemCombsExplore from "~/components/items-page/ItemCombsExplore";
import ItemPurchaseAnalysis from "~/components/items-page/ItemPurchaseAnalysis";
import ItemStatsTable from "~/components/items-page/ItemStatsTable";
import { PatchOrDatePicker } from "~/components/PatchOrDatePicker";
import { GameModeSelector, parseAsGameMode } from "~/components/selectors/GameModeSelector";
import HeroSelector from "~/components/selectors/HeroSelector";
import RankRangeSelector from "~/components/selectors/RankRangeSelector";
import TimeWindowSelector from "~/components/selectors/TimeWindowSelector";
import { Card, CardContent } from "~/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { PATCHES } from "~/lib/constants";
import { parseAsDayjsRange } from "~/lib/nuqs-parsers";

export const meta: MetaFunction = () => {
  return [
    { title: "Items - Deadlock API" },
    {
      name: "description",
      content: "Detailed analytics about Items in Deadlock",
    },
  ];
};

export default function Items(
  { initialTab }: { initialTab?: "stats" | "item-purchase-analysis" | "item-combs" } = {
    initialTab: "stats",
  },
) {
  const [gameMode, setGameMode] = useQueryState("game_mode", parseAsGameMode);
  const [minRankId, setMinRankId] = useQueryState("min_rank", parseAsInteger.withDefault(91));
  const [maxRankId, setMaxRankId] = useQueryState("max_rank", parseAsInteger.withDefault(116));
  const [minBoughtAtS, setMinBoughtAtS] = useQueryState("min_bought_at", parseAsInteger);
  const [maxBoughtAtS, setMaxBoughtAtS] = useQueryState("max_bought_at", parseAsInteger);
  const [hero, setHero] = useQueryState("hero", parseAsInteger);
  const [minMatches, setMinMatches] = useQueryState("min_matches", parseAsInteger.withDefault(10));
  const [[startDate, endDate], setDateRange] = useQueryState(
    "date_range",
    parseAsDayjsRange.withDefault([PATCHES[0].startDate, PATCHES[0].endDate]),
  );
  const isStreetBrawl = gameMode === "street_brawl";
  const effectiveMinRankId = isStreetBrawl ? undefined : minRankId;
  const effectiveMaxRankId = isStreetBrawl ? undefined : maxRankId;

  const [tab, setTab] = useQueryState(
    "tab",
    parseAsStringLiteral(["stats", "item-purchase-analysis", "item-combs"] as const).withDefault(initialTab || "stats"),
  );

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Item Stats</h1>
        <p className="text-sm text-muted-foreground mt-1">Win rates, purchase timing, and item combination analytics</p>
      </div>
      <Card className="w-fit mx-auto">
        <CardContent>
          <div className="flex flex-wrap items-end gap-2 justify-center">
            <HeroSelector
              onHeroSelected={(x) => setHero(x ?? null)}
              selectedHero={hero ?? undefined}
              allowSelectNull={true}
            />
            <div className="flex flex-col min-w-24 max-w-sm gap-1.5">
              <div className="flex justify-center md:justify-start items-center h-8">
                <span className="text-sm font-semibold text-foreground">Min Matches</span>
              </div>
              <div className="flex items-center border rounded-md px-2 py-1 bg-transparent min-w-0 h-9 w-full md:text-sm focus-within:ring-2 focus-within:ring-ring/50 focus-within:border-ring">
                <button
                  type="button"
                  aria-label="Decrease min matches"
                  className="px-2 text-lg font-bold text-muted-foreground hover:text-foreground focus:outline-none"
                  onClick={() => setMinMatches(Math.max(0, minMatches - 10))}
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
            <GameModeSelector value={gameMode} onChange={setGameMode} />
            {gameMode !== "street_brawl" && (
              <RankRangeSelector
                minRank={minRankId}
                maxRank={maxRankId}
                onRankChange={(min, max) => {
                  setMinRankId(min);
                  setMaxRankId(max);
                }}
              />
            )}
            <TimeWindowSelector
              minTime={minBoughtAtS ?? undefined}
              maxTime={maxBoughtAtS ?? undefined}
              onTimeChange={(min, max) => {
                setMinBoughtAtS(min ?? null);
                setMaxBoughtAtS(max ?? null);
              }}
            />
            <PatchOrDatePicker
              patchDates={PATCHES}
              value={{ startDate, endDate }}
              onValueChange={({ startDate, endDate }) => setDateRange([startDate, endDate])}
            />
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab ?? undefined} onValueChange={(value) => setTab(value as typeof tab)} className="w-full">
        <TabsList variant="line" className="flex items-center justify-start flex-wrap h-auto w-full">
          <TabsTrigger className="flex-1" value="stats">
            Overall Stats
          </TabsTrigger>
          <TabsTrigger className="flex-1" value="item-purchase-analysis">
            Purchase Analysis
          </TabsTrigger>
          <TabsTrigger className="flex-1" value="item-combs">
            Combination Stats
          </TabsTrigger>
        </TabsList>
        <TabsContent value="stats">
          <ItemStatsTable
            columns={["itemsTier", "winRate", "usage", "confidence"]}
            initialSort={{ field: "winRate", direction: "desc" }}
            minRankId={effectiveMinRankId}
            maxRankId={effectiveMaxRankId}
            minDate={startDate || undefined}
            maxDate={endDate || undefined}
            hero={hero}
            minMatches={minMatches}
            minBoughtAtS={minBoughtAtS ?? undefined}
            maxBoughtAtS={maxBoughtAtS ?? undefined}
            gameMode={gameMode}
          />
        </TabsContent>
        <TabsContent value="item-purchase-analysis">
          <ItemPurchaseAnalysis
            minRankId={effectiveMinRankId}
            maxRankId={effectiveMaxRankId}
            minDate={startDate || undefined}
            maxDate={endDate || undefined}
            hero={hero}
            minMatches={minMatches}
            minBoughtAtS={minBoughtAtS ?? undefined}
            maxBoughtAtS={maxBoughtAtS ?? undefined}
            gameMode={gameMode}
          />
        </TabsContent>
        <TabsContent value="item-combs">
          <ItemCombsExplore
            sortBy="winrate"
            minRankId={effectiveMinRankId}
            maxRankId={effectiveMaxRankId}
            minDate={startDate || undefined}
            maxDate={endDate || undefined}
            hero={hero}
            minMatches={minMatches}
            minBoughtAtS={minBoughtAtS ?? undefined}
            maxBoughtAtS={maxBoughtAtS ?? undefined}
            gameMode={gameMode}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
