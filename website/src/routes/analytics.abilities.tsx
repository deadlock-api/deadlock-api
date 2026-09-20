import { createFileRoute } from "@tanstack/react-router";
import { parseAsInteger, useQueryState } from "nuqs";
import { Suspense, useMemo, useState } from "react";

import { Filter } from "~/components/domain/filters";
import { DEFAULT_MATCH_MODE } from "~/components/domain/selectors/MatchModeSelector";
import AbilityOrderTree from "~/components/features/abilities/AbilityOrderTree";
import type { TriState } from "~/components/patterns/filter-bar/TriStateSelector";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { ChunkErrorBoundary } from "~/components/patterns/states/ChunkErrorBoundary";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { useDateRangeState } from "~/hooks/useDateRangeState";
import { useModeState } from "~/hooks/useModeState";
import { getEffectiveRankRange } from "~/lib/game-mode";
import { prefetchSafe } from "~/lib/prefetch-safe";
import { defaultUnixRange } from "~/lib/seasons";
import { seo } from "~/lib/seo";
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
      queryClient.ensureQueryData(
        abilityOrderQueryOptions({
          heroId: deps.heroId,
          gameMode: "normal",
          matchMode: DEFAULT_MATCH_MODE,
          minAverageBadge: 0,
          maxAverageBadge: 116,
          ...range,
          minMatches: 20,
        }),
      ),
    );
  },
  head: () =>
    seo({
      title: "Deadlock Ability Stats: Skill Build Win Rates & Upgrade Paths",
      description:
        "Deadlock ability upgrade path analytics: which skill orders win the most? Win rates by ability level order for every hero, filtered by rank and patch.",
      path: "/analytics/abilities",
    }),
});

function AbilitiesPage() {
  const [heroId, setHeroId] = useQueryState("hero_id", parseAsInteger.withDefault(DEFAULT_HERO_ID));
  const [minRankId, setMinRankId] = useQueryState("min_rank", parseAsInteger.withDefault(0));
  const [maxRankId, setMaxRankId] = useQueryState("max_rank", parseAsInteger.withDefault(116));
  const { mode, setMode, gameMode, matchMode } = useModeState();
  const { startDate, endDate, handleDateChange, defaultRange } = useDateRangeState();
  const [minMatches, setMinMatches] = useQueryState("min_matches", parseAsInteger.withDefault(20));
  const [itemSelections, setItemSelections] = useState<Map<number, TriState>>(new Map());

  const { effectiveMinRankId, effectiveMaxRankId } = getEffectiveRankRange(mode, minRankId, maxRankId);

  const includeItemIds = useMemo(
    () => [...itemSelections.entries()].filter(([, s]) => s === "included").map(([id]) => id),
    [itemSelections],
  );
  const excludeItemIds = useMemo(
    () => [...itemSelections.entries()].filter(([, s]) => s === "excluded").map(([id]) => id),
    [itemSelections],
  );

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
            if (id != null) setHeroId(id);
          }}
        />
        <Filter.ModeWithRank
          value={{ mode, rank: [minRankId, maxRankId] }}
          onValueChange={(next) => {
            if (next.mode !== mode) setMode(next.mode);
            if (next.rank[0] !== minRankId || next.rank[1] !== maxRankId) {
              setMinRankId(next.rank[0]);
              setMaxRankId(next.rank[1]);
            }
          }}
        />
        <Filter.MinMatches value={minMatches} onValueChange={setMinMatches} min={0} defaultValue={20} />
        <Filter.ItemsTriState value={itemSelections} onValueChange={setItemSelections} label="Items" />
        <Filter.SeasonPatchDate
          value={{ startDate, endDate }}
          onValueChange={(next) => handleDateChange(next.startDate, next.endDate, next.action)}
          resetRange={defaultRange}
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
