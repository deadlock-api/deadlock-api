import { createFileRoute } from "@tanstack/react-router";
import { parseAsInteger, parseAsStringLiteral, useQueryState } from "nuqs";
import { lazy, Suspense, useState } from "react";

import { ChunkErrorBoundary } from "~/components/ChunkErrorBoundary";
import { Filter } from "~/components/Filter";
import { ItemStatsTable } from "~/components/items-page/ItemStatsTable";
import { LoadingLogo } from "~/components/LoadingLogo";
import { ResponsiveTabsList } from "~/components/ResponsiveTabsList";
import { parseAsGameMode } from "~/components/selectors/GameModeSelector";
import { Tabs, TabsContent } from "~/components/ui/tabs";
import type { Dayjs } from "~/dayjs";
import { DEFAULT_DATE_RANGE, DEFAULT_PREV_DATE_RANGE } from "~/lib/constants";
import { getEffectiveRankRange } from "~/lib/game-mode";
import { parseAsDayjsRange } from "~/lib/nuqs-parsers";
import { prefetchSafe } from "~/lib/prefetch-safe";
import { seo } from "~/lib/seo";
import { normalizeUnixCeil, normalizeUnixFloor } from "~/lib/time-normalize";
import { itemStatsQueryOptions } from "~/queries/item-stats-query";

const ItemPurchaseAnalysis = lazy(() =>
  import("~/components/items-page/ItemPurchaseAnalysis").then((m) => ({ default: m.ItemPurchaseAnalysis })),
);
const ItemCombsExplore = lazy(() =>
  import("~/components/items-page/ItemCombsExplore").then((m) => ({ default: m.ItemCombsExplore })),
);

export const Route = createFileRoute("/items")({
  component: ItemsPage,
  loader: async ({ context: { queryClient } }) => {
    const minUnixTimestamp = normalizeUnixFloor(DEFAULT_DATE_RANGE[0]) ?? 0;
    const maxUnixTimestamp = normalizeUnixCeil(DEFAULT_DATE_RANGE[1]);
    const common = {
      minMatches: 10,
      heroId: null,
      minAverageBadge: 91,
      maxAverageBadge: 116,
      minBoughtAtS: undefined,
      maxBoughtAtS: undefined,
      gameMode: "normal" as const,
    };
    await Promise.all([
      prefetchSafe(
        queryClient.ensureQueryData(itemStatsQueryOptions({ ...common, minUnixTimestamp, maxUnixTimestamp })),
      ),
      prefetchSafe(
        queryClient.ensureQueryData(
          itemStatsQueryOptions({
            ...common,
            minUnixTimestamp: normalizeUnixFloor(DEFAULT_PREV_DATE_RANGE[0]) ?? 0,
            maxUnixTimestamp: normalizeUnixCeil(DEFAULT_PREV_DATE_RANGE[1]),
          }),
        ),
      ),
    ]);
  },
  head: () =>
    seo({
      title: "Deadlock Item Stats: Build Win Rates, Buy Timings & Combos",
      description:
        "Deadlock item win rates with statistical confidence intervals, optimal purchase timing, and item combo analytics. Filter by hero, rank, and patch.",
      path: "/items",
    }),
});

function ItemsPage() {
  const [gameMode, setGameMode] = useQueryState("game_mode", parseAsGameMode);
  const [minRankId, setMinRankId] = useQueryState("min_rank", parseAsInteger.withDefault(91));
  const [maxRankId, setMaxRankId] = useQueryState("max_rank", parseAsInteger.withDefault(116));
  const [minBoughtAtS, setMinBoughtAtS] = useQueryState("min_bought_at", parseAsInteger);
  const [maxBoughtAtS, setMaxBoughtAtS] = useQueryState("max_bought_at", parseAsInteger);
  const [hero, setHero] = useQueryState("hero", parseAsInteger);
  const [minMatches, setMinMatches] = useQueryState("min_matches", parseAsInteger.withDefault(10));
  const [[startDate, endDate], setDateRange] = useQueryState(
    "date_range",
    parseAsDayjsRange.withDefault(DEFAULT_DATE_RANGE),
  );
  const [prevDates, setPrevDates] = useState<{ prevStartDate?: Dayjs; prevEndDate?: Dayjs }>(() => ({
    prevStartDate: DEFAULT_PREV_DATE_RANGE[0],
    prevEndDate: DEFAULT_PREV_DATE_RANGE[1],
  }));
  const { effectiveMinRankId, effectiveMaxRankId } = getEffectiveRankRange(gameMode, minRankId, maxRankId);

  const [tab, setTab] = useQueryState(
    "tab",
    parseAsStringLiteral(["stats", "item-purchase-analysis", "item-combs"] as const).withDefault("stats"),
  );

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Item Stats</h1>
        <p className="mt-1 text-sm text-muted-foreground">Win rates, purchase timing, and item combination analytics</p>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Analyze item win rates with statistical confidence intervals, optimal purchase timing, and the best item
          combinations for Deadlock. Filter by hero, rank, and patch to build smarter and climb the ladder. Statistics
          use Wilson score intervals for reliable estimates even on less popular items.
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
          <h2 className="sr-only">Overall Item Stats</h2>
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
          <h2 className="sr-only">Item Purchase Analysis</h2>
          <ChunkErrorBoundary>
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
          </ChunkErrorBoundary>
        </TabsContent>
        <TabsContent value="item-combs">
          <h2 className="sr-only">Item Combos</h2>
          <ChunkErrorBoundary>
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
          </ChunkErrorBoundary>
        </TabsContent>
      </Tabs>
    </div>
  );
}
