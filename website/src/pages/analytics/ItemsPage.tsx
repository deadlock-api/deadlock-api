import { parseAsInteger, useQueryState } from "nuqs";
import { lazy, Suspense } from "react";

import { Filter } from "~/components/domain/filters";
import { ItemCombFilters } from "~/components/features/items/ItemCombFilters";
import { ResponsiveTab, ResponsiveTabsList } from "~/components/patterns/navigation/ResponsiveTabsList";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { Section } from "~/components/patterns/page/Section";
import { ChunkErrorBoundary } from "~/components/patterns/states/ChunkErrorBoundary";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Tabs, TabsContent } from "~/components/ui/tabs";
import { useAnalyticsTab } from "~/hooks/useAnalyticsTab";
import { useKnownHeroId } from "~/hooks/useAssetById";
import { useDateRangeState } from "~/hooks/useDateRangeState";
import { useModeState } from "~/hooks/useModeState";
import { ANALYTICS_VIEWS } from "~/lib/analytics-tabs";
import { DEFAULT_MODE, getEffectiveRankRange } from "~/lib/game-mode";

const ItemPurchaseAnalysis = lazy(() =>
  import("~/components/features/items/ItemPurchaseAnalysis").then((m) => ({ default: m.ItemPurchaseAnalysis })),
);
const ItemStatsExplorer = lazy(() =>
  import("~/components/features/items/ItemStatsExplorer").then((m) => ({ default: m.ItemStatsExplorer })),
);
const ItemFlowGraph = lazy(() =>
  import("~/components/features/items/ItemFlowGraph").then((m) => ({ default: m.ItemFlowGraph })),
);
const ItemCombStatsTable = lazy(() =>
  import("~/components/features/items/ItemCombStatsTable").then((m) => ({ default: m.ItemCombStatsTable })),
);

export function ItemsPage() {
  const { mode, setMode, gameMode, matchMode } = useModeState();
  const [minRankId, setMinRankId] = useQueryState("min_rank", parseAsInteger.withDefault(91));
  const [maxRankId, setMaxRankId] = useQueryState("max_rank", parseAsInteger.withDefault(116));
  const [minBoughtAtS, setMinBoughtAtS] = useQueryState("min_bought_at", parseAsInteger);
  const [maxBoughtAtS, setMaxBoughtAtS] = useQueryState("max_bought_at", parseAsInteger);
  const [heroParam, setHero] = useQueryState("hero", parseAsInteger);
  const hero = useKnownHeroId(heroParam);
  const [minMatches, setMinMatches] = useQueryState("min_matches", parseAsInteger.withDefault(10));
  const { startDate, endDate, prevStartDate, prevEndDate, handleDateChange, defaultRange } = useDateRangeState();
  const { effectiveMinRankId, effectiveMaxRankId } = getEffectiveRankRange(mode, minRankId, maxRankId);

  const [tab, setTab] = useAnalyticsTab("items");

  return (
    <PageShell>
      <PageHeader title={ANALYTICS_VIEWS.items[tab].heading} description={ANALYTICS_VIEWS.items[tab].summary}>
        <p>
          Analyze item win rates with statistical confidence intervals, optimal purchase timing, and the best item
          combinations for Deadlock. Filter by hero, rank, and patch to build smarter and climb the ladder. Statistics
          use Wilson score intervals for reliable estimates even on less popular items.
        </p>
      </PageHeader>
      <Filter.Root>
        <Filter.Hero value={hero} onValueChange={setHero} allowNull />
        <Filter.MinMatches value={minMatches} onValueChange={setMinMatches} defaultValue={10} />
        <Filter.ModeWithRank
          value={{ mode, rank: [minRankId, maxRankId] }}
          defaultValue={{ mode: DEFAULT_MODE, rank: [91, 116] }}
          onValueChange={(next) => {
            if (next.mode !== mode) setMode(next.mode);
            if (next.rank[0] !== minRankId || next.rank[1] !== maxRankId) {
              setMinRankId(next.rank[0]);
              setMaxRankId(next.rank[1]);
            }
          }}
        />
        {/* Build Flow and Item Combos do not take a purchase window; a filter there would silently do nothing. */}
        {(tab === "item-stats" || tab === "item-purchase-analysis") && (
          <Filter.TimeRange
            value={[minBoughtAtS ?? undefined, maxBoughtAtS ?? undefined]}
            onValueChange={([min, max]) => {
              setMinBoughtAtS(min ?? null);
              setMaxBoughtAtS(max ?? null);
            }}
            label="Time"
            title="Purchase Time Window"
          />
        )}
        <Filter.SeasonPatchDate
          value={{ startDate, endDate }}
          onValueChange={(next) => handleDateChange(next.startDate, next.endDate, next.action)}
          defaultValue={{ startDate: defaultRange[0], endDate: defaultRange[1] }}
        />
        {tab === "item-combos" && <ItemCombFilters />}
      </Filter.Root>

      <Tabs value={tab ?? undefined} onValueChange={(value) => setTab(value as typeof tab)} className="w-full">
        <ResponsiveTabsList
          aria-label="Item stats sections"
          value={tab ?? undefined}
          onValueChange={(value) => setTab(value as typeof tab)}
        >
          <ResponsiveTab value="item-stats">Overall Stats</ResponsiveTab>
          <ResponsiveTab value="item-purchase-analysis">Purchase Analysis</ResponsiveTab>
          <ResponsiveTab value="build-flow">Build Flow</ResponsiveTab>
          <ResponsiveTab value="item-combos">Item Combos</ResponsiveTab>
        </ResponsiveTabsList>
        <TabsContent value="item-stats">
          <Section titleDisplay="hidden" title="Overall Item Stats">
            <ChunkErrorBoundary>
              <Suspense fallback={<LoadingState />}>
                <ItemStatsExplorer
                  sortBy="winrate"
                  minRankId={effectiveMinRankId}
                  maxRankId={effectiveMaxRankId}
                  minDate={startDate || undefined}
                  maxDate={endDate || undefined}
                  prevMinDate={prevStartDate}
                  prevMaxDate={prevEndDate}
                  hero={hero}
                  minMatches={minMatches}
                  minBoughtAtS={minBoughtAtS ?? undefined}
                  maxBoughtAtS={maxBoughtAtS ?? undefined}
                  gameMode={gameMode}
                  matchMode={matchMode}
                />
              </Suspense>
            </ChunkErrorBoundary>
          </Section>
        </TabsContent>
        <TabsContent value="item-purchase-analysis">
          <Section titleDisplay="hidden" title="Item Purchase Analysis">
            <ChunkErrorBoundary>
              <Suspense fallback={<LoadingState />}>
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
                  matchMode={matchMode}
                />
              </Suspense>
            </ChunkErrorBoundary>
          </Section>
        </TabsContent>
        <TabsContent value="build-flow">
          <Section titleDisplay="hidden" title="Item Build Flow">
            <ChunkErrorBoundary>
              <Suspense fallback={<LoadingState />}>
                <ItemFlowGraph
                  heroId={hero}
                  minRankId={effectiveMinRankId}
                  maxRankId={effectiveMaxRankId}
                  minDate={startDate || undefined}
                  maxDate={endDate || undefined}
                  minMatches={minMatches}
                  gameMode={gameMode}
                  matchMode={matchMode}
                />
              </Suspense>
            </ChunkErrorBoundary>
          </Section>
        </TabsContent>
        <TabsContent value="item-combos">
          <Section titleDisplay="hidden" title="Item Combos">
            <ChunkErrorBoundary>
              <Suspense fallback={<LoadingState />}>
                <ItemCombStatsTable
                  columns={["winRate", "pickRate", "totalMatches"]}
                  hero={hero}
                  minRankId={effectiveMinRankId}
                  maxRankId={effectiveMaxRankId}
                  minMatches={minMatches}
                  minDate={startDate || undefined}
                  maxDate={endDate || undefined}
                  prevMinDate={prevStartDate}
                  prevMaxDate={prevEndDate}
                  gameMode={gameMode}
                  matchMode={matchMode}
                />
              </Suspense>
            </ChunkErrorBoundary>
          </Section>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
