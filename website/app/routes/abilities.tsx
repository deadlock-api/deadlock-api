import { parseAsInteger, useQueryState } from "nuqs";
import { lazy, Suspense, useMemo, useState } from "react";
import type { MetaFunction } from "react-router";

import { ChunkErrorBoundary } from "~/components/ChunkErrorBoundary";
import { Filter } from "~/components/Filter";
import { LoadingLogo } from "~/components/LoadingLogo";

const AbilityOrderTree = lazy(() => import("~/components/abilities/AbilityOrderTree"));

import { parseAsGameMode } from "~/components/selectors/GameModeSelector";
import type { TriState } from "~/components/selectors/TriStateSelector";
import { DEFAULT_DATE_RANGE } from "~/lib/constants";
import { createPageMeta } from "~/lib/meta";
import { parseAsDayjsRange } from "~/lib/nuqs-parsers";

export const meta: MetaFunction = () => {
  return createPageMeta({
    title: "Ability Stats & Upgrade Paths | Deadlock API",
    description: "Ability upgrade paths and win rates for every Deadlock hero. Analyze optimal skill orders by rank.",
    path: "/abilities",
  });
};

export default function AbilityOrder() {
  const [heroId, setHeroId] = useQueryState("hero_id", parseAsInteger.withDefault(2));
  const [minRankId, setMinRankId] = useQueryState("min_rank", parseAsInteger.withDefault(0));
  const [maxRankId, setMaxRankId] = useQueryState("max_rank", parseAsInteger.withDefault(116));
  const [gameMode, setGameMode] = useQueryState("game_mode", parseAsGameMode);
  const [[startDate, endDate], setDateRange] = useQueryState(
    "date_range",
    parseAsDayjsRange.withDefault(DEFAULT_DATE_RANGE),
  );
  const [minMatches, setMinMatches] = useQueryState("min_matches", parseAsInteger.withDefault(20));
  const [itemSelections, setItemSelections] = useState<Map<number, TriState>>(new Map());

  const includeItemIds = useMemo(
    () => [...itemSelections.entries()].filter(([_, s]) => s === "included").map(([id]) => id),
    [itemSelections],
  );
  const excludeItemIds = useMemo(
    () => [...itemSelections.entries()].filter(([_, s]) => s === "excluded").map(([id]) => id),
    [itemSelections],
  );

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Ability Stats</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Explore the most common ability upgrade paths and their win rates
        </p>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Analyze the most popular and highest win rate ability upgrade paths for every Deadlock hero. See which skill
          orders are favored at different rank brackets, and how item choices affect optimal ability leveling.
        </p>
      </div>

      <Filter.Root>
        <Filter.Hero
          value={heroId}
          onChange={(id) => {
            if (id != null) setHeroId(id);
          }}
        />
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
        <Filter.MinMatches value={minMatches} onChange={setMinMatches} min={0} />
        <Filter.ItemsTriState selections={itemSelections} onSelectionsChange={setItemSelections} label="Items" />
        <Filter.PatchOrDate startDate={startDate} endDate={endDate} onDateChange={(s, e) => setDateRange([s, e])} />
      </Filter.Root>

      <ChunkErrorBoundary>
        <Suspense fallback={<LoadingLogo />}>
          <AbilityOrderTree
            heroId={heroId}
            minRankId={gameMode !== "street_brawl" ? minRankId : undefined}
            maxRankId={gameMode !== "street_brawl" ? maxRankId : undefined}
            minDate={startDate}
            maxDate={endDate}
            minMatches={minMatches}
            gameMode={gameMode}
            defaultDepth={2}
            includeItemIds={includeItemIds}
            excludeItemIds={excludeItemIds}
          />
        </Suspense>
      </ChunkErrorBoundary>
    </div>
  );
}
