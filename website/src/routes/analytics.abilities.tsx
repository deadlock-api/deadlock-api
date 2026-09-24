import { createFileRoute } from "@tanstack/react-router";
import { parseAsArrayOf, parseAsInteger, useQueryState, useQueryStates } from "nuqs";
import { Suspense, useMemo } from "react";

import { Filter } from "~/components/domain/filters";
import AbilityOrderTree from "~/components/features/abilities/AbilityOrderTree";
import type { TriState } from "~/components/patterns/filter-bar/TriStateSelector";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { ChunkErrorBoundary } from "~/components/patterns/states/ChunkErrorBoundary";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { useKnownHeroId } from "~/hooks/useAssetById";
import { useDateRangeState } from "~/hooks/useDateRangeState";
import { useModeState } from "~/hooks/useModeState";
import { DEFAULT_MATCH_MODE, getEffectiveRankRange } from "~/lib/game-mode";
import { prefetchSafe } from "~/lib/prefetch-safe";
import { defaultUnixRange } from "~/lib/seasons";
import { pageTitle, seo } from "~/lib/seo";
import { abilityOrderQueryOptions } from "~/queries/ability-order-query";
import { loadSeasons } from "~/queries/asset-queries";

const DEFAULT_HERO_ID = 2;

export const Route = createFileRoute("/analytics/abilities")({
  component: AbilitiesPage,
  // The hero filter lives in the URL under nuqs; read it here so the loader warms the hero the page will show.
  loaderDeps: ({ search }) => {
    const heroId = (search as { hero_id?: unknown }).hero_id;
    return { heroId: typeof heroId === "number" && Number.isInteger(heroId) ? heroId : DEFAULT_HERO_ID };
  },
  loader: async ({ context: { queryClient, preferences }, deps }) => {
    const range = defaultUnixRange(await loadSeasons(queryClient), preferences.dateFilter);
    await prefetchSafe(
      queryClient.query({
        ...abilityOrderQueryOptions({
          heroId: deps.heroId,
          gameMode: "normal",
          matchMode: DEFAULT_MATCH_MODE,
          minAverageBadge: 0,
          maxAverageBadge: 116,
          ...range,
          minMatches: 20,
        }),
        staleTime: "static",
      }),
    );
  },
  head: () =>
    seo({
      title: pageTitle("Deadlock Ability Builds & Upgrade Win Rates"),
      description:
        "Deadlock ability upgrade path analytics: which skill orders win the most? Win rates by ability level order for every hero, filtered by rank and patch.",
      path: "/analytics/abilities",
    }),
});

function AbilitiesPage() {
  const [heroIdParam, setHeroId] = useQueryState("hero_id", parseAsInteger.withDefault(DEFAULT_HERO_ID));
  const heroId = useKnownHeroId(heroIdParam) ?? DEFAULT_HERO_ID;
  const [minRankId, setMinRankId] = useQueryState("min_rank", parseAsInteger.withDefault(0));
  const [maxRankId, setMaxRankId] = useQueryState("max_rank", parseAsInteger.withDefault(116));
  const { mode, setMode, gameMode, matchMode } = useModeState();
  const { startDate, endDate, handleDateChange, defaultRange } = useDateRangeState();
  const [minMatches, setMinMatches] = useQueryState("min_matches", parseAsInteger.withDefault(20));
  // In the URL like every other filter, so a shared or reloaded link and Back keep them. One update sets both lists.
  const [items, setItems] = useQueryStates({
    include_items: parseAsArrayOf(parseAsInteger).withDefault([]),
    exclude_items: parseAsArrayOf(parseAsInteger).withDefault([]),
  });
  const itemSelections = useMemo(
    () =>
      new Map<number, TriState>([
        ...items.include_items.map((id): [number, TriState] => [id, "included"]),
        ...items.exclude_items.map((id): [number, TriState] => [id, "excluded"]),
      ]),
    [items],
  );
  const setItemSelections = (next: Map<number, TriState>) => {
    const ids = (state: TriState) => [...next].filter(([, s]) => s === state).map(([id]) => id);
    void setItems({
      include_items: ids("included").length > 0 ? ids("included") : null,
      exclude_items: ids("excluded").length > 0 ? ids("excluded") : null,
    });
  };

  const { effectiveMinRankId, effectiveMaxRankId } = getEffectiveRankRange(mode, minRankId, maxRankId);

  const includeItemIds = items.include_items;
  const excludeItemIds = items.exclude_items;

  return (
    <PageShell>
      <PageHeader title="Ability Stats" description="Explore the most common ability upgrade paths and their win rates">
        <p>
          Analyze the most popular and highest win rate ability upgrade paths for every Deadlock hero. See which skill
          orders are favored at different rank brackets, and how item choices affect optimal ability leveling.
        </p>
      </PageHeader>

      <Filter.Root>
        <Filter.Hero
          value={heroId}
          defaultValue={DEFAULT_HERO_ID}
          onValueChange={(id) => {
            if (id != null) void setHeroId(id);
          }}
        />
        <Filter.ModeWithRank
          value={{ mode, rank: [minRankId, maxRankId] }}
          onValueChange={(next) => {
            if (next.mode !== mode) setMode(next.mode);
            if (next.rank[0] !== minRankId || next.rank[1] !== maxRankId) {
              void setMinRankId(next.rank[0]);
              void setMaxRankId(next.rank[1]);
            }
          }}
        />
        <Filter.MinMatches value={minMatches} onValueChange={setMinMatches} min={0} defaultValue={20} />
        <Filter.ItemsTriState value={itemSelections} onValueChange={setItemSelections} />
        <Filter.SeasonPatchDate
          value={{ startDate, endDate }}
          onValueChange={(next) => handleDateChange(next.startDate, next.endDate, next.action)}
          defaultValue={{ startDate: defaultRange[0], endDate: defaultRange[1] }}
        />
      </Filter.Root>

      <ChunkErrorBoundary>
        <Suspense fallback={<LoadingState />}>
          <AbilityOrderTree
            heroId={heroId}
            minRankId={effectiveMinRankId}
            maxRankId={effectiveMaxRankId}
            minDate={startDate}
            maxDate={endDate}
            minMatches={minMatches}
            gameMode={gameMode}
            matchMode={matchMode}
            defaultDepth={2}
            includeItemIds={includeItemIds}
            excludeItemIds={excludeItemIds}
          />
        </Suspense>
      </ChunkErrorBoundary>
    </PageShell>
  );
}
