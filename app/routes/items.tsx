import { parseAsInteger, parseAsStringLiteral, useQueryState } from "nuqs";
import { Suspense, lazy, useState } from "react";
import type { MetaFunction } from "react-router";
import { Filter } from "~/components/Filter";
import { ItemStatsTable } from "~/components/items-page/ItemStatsTable";
import { LoadingLogo } from "~/components/LoadingLogo";
import { computePreviousPeriod } from "~/components/PatchOrDatePicker";
import { parseAsGameMode } from "~/components/selectors/GameModeSelector";
import { ResponsiveTabsList } from "~/components/ResponsiveTabsList";
import { Tabs, TabsContent } from "~/components/ui/tabs";
import { PATCHES } from "~/lib/constants";
import { createPageMeta } from "~/lib/meta";
import { parseAsDayjsRange } from "~/lib/nuqs-parsers";

const ItemPurchaseAnalysis = lazy(() =>
  import("~/components/items-page/ItemPurchaseAnalysis").then((m) => ({ default: m.ItemPurchaseAnalysis })),
);
const ItemCombsExplore = lazy(() =>
  import("~/components/items-page/ItemCombsExplore").then((m) => ({ default: m.ItemCombsExplore })),
);

export const meta: MetaFunction = () => {
  return createPageMeta({
    title: "Item Stats & Build Analytics | Deadlock API",
    description: "Item win rates, purchase timing, confidence intervals, and combo analytics for Deadlock.",
    path: "/items",
  });
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
  const [prevDates, setPrevDates] = useState(() =>
    computePreviousPeriod(PATCHES[0].startDate, PATCHES[0].endDate, PATCHES),
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
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl mx-auto leading-relaxed">
          Analyze item win rates with statistical confidence intervals, optimal purchase timing, and the best item
          combinations for Deadlock. Filter by hero, rank, and patch to build smarter and climb the ladder.
        </p>
      </div>
      <Filter.Root>
        <Filter.Hero value={hero} onChange={setHero} allowNull />
        <Filter.MinMatches value={minMatches} onChange={setMinMatches} />
        <Filter.GameModeWithRank
          gameMode={gameMode}
          onGameModeChange={setGameMode}
          minRank={minRankId}
          maxRank={maxRankId}
          onRankChange={(min, max) => {
            setMinRankId(min);
            setMaxRankId(max);
          }}
        />
        <Filter.TimeRange
          minTime={minBoughtAtS ?? undefined}
          maxTime={maxBoughtAtS ?? undefined}
          onTimeChange={(min, max) => {
            setMinBoughtAtS(min ?? null);
            setMaxBoughtAtS(max ?? null);
          }}
          label="Time"
          title="Purchase Time Window"
          description="Filter items by when they were purchased in the match."
        />
        <Filter.PatchOrDate
          startDate={startDate}
          endDate={endDate}
          onDateChange={(s, e, ps, pe) => {
            setDateRange([s, e]);
            setPrevDates({ prevStartDate: ps, prevEndDate: pe });
          }}
        />
      </Filter.Root>

      <Tabs value={tab ?? undefined} onValueChange={(value) => setTab(value as typeof tab)} className="tabs-nav w-full">
        <ResponsiveTabsList
          value={tab ?? undefined}
          onValueChange={(value) => setTab(value as typeof tab)}
          options={[
            { value: "stats", label: "Overall Stats" },
            { value: "item-purchase-analysis", label: "Purchase Analysis" },
            { value: "item-combs", label: "Combos" },
          ]}
        />
        <TabsContent value="stats">
          <ItemStatsTable
            columns={["itemsTier", "winRate", "matches", "confidence"]}
            initialSort={{ field: "winRate", direction: "desc" }}
            minRankId={effectiveMinRankId}
            maxRankId={effectiveMaxRankId}
            minDate={startDate || undefined}
            maxDate={endDate || undefined}
            prevMinDate={prevDates.prevStartDate}
            prevMaxDate={prevDates.prevEndDate}
            hero={hero}
            minMatches={minMatches}
            minBoughtAtS={minBoughtAtS ?? undefined}
            maxBoughtAtS={maxBoughtAtS ?? undefined}
            gameMode={gameMode}
          />
        </TabsContent>
        <TabsContent value="item-purchase-analysis">
          <Suspense fallback={<LoadingLogo />}>
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
          </Suspense>
        </TabsContent>
        <TabsContent value="item-combs">
          <Suspense fallback={<LoadingLogo />}>
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
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
