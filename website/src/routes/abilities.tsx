import { createFileRoute } from "@tanstack/react-router";
import { parseAsInteger, useQueryState } from "nuqs";
import { Suspense, useMemo, useState } from "react";

import AbilityOrderTree from "~/components/abilities/AbilityOrderTree";
import { ChunkErrorBoundary } from "~/components/ChunkErrorBoundary";
import { Filter } from "~/components/Filter";
import { LoadingLogo } from "~/components/LoadingLogo";
import { parseAsGameMode } from "~/components/selectors/GameModeSelector";
import type { TriState } from "~/components/selectors/TriStateSelector";
import { DEFAULT_DATE_RANGE } from "~/lib/constants";
import { parseAsDayjsRange } from "~/lib/nuqs-parsers";
import { seo } from "~/lib/seo";
import { normalizeUnixCeil, normalizeUnixFloor } from "~/lib/time-normalize";
import { abilityOrderQueryOptions } from "~/queries/ability-order-query";

export const Route = createFileRoute("/abilities")({
  component: AbilitiesPage,
  loader: async ({ context: { queryClient } }) => {
    await queryClient.ensureQueryData(
      abilityOrderQueryOptions({
        heroId: 2,
        gameMode: "normal",
        minAverageBadge: 0,
        maxAverageBadge: 116,
        minUnixTimestamp: normalizeUnixFloor(DEFAULT_DATE_RANGE[0]) ?? 0,
        maxUnixTimestamp: normalizeUnixCeil(DEFAULT_DATE_RANGE[1]),
        minMatches: 20,
      }),
    );
  },
  head: () =>
    seo({
      title: "Deadlock Ability Stats: Skill Build Win Rates & Upgrade Paths",
      description:
        "Deadlock ability upgrade path analytics: which skill orders win the most? Win rates by ability level order for every hero, filtered by rank and patch.",
      path: "/abilities",
    }),
});

function AbilitiesPage() {
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
