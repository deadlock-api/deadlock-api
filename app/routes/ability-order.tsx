import { parseAsInteger, useQueryState } from "nuqs";
import { useMemo, useState } from "react";
import type { MetaFunction } from "react-router";
import AbilityOrderTree from "~/components/ability-order/AbilityOrderTree";
import { Filter } from "~/components/Filter";
import { parseAsGameMode } from "~/components/selectors/GameModeSelector";
import { ItemSelectorTriState } from "~/components/selectors/ItemSelectorTriState";
import type { TriState } from "~/components/selectors/TriStateSelector";
import { PATCHES } from "~/lib/constants";
import { parseAsDayjsRange } from "~/lib/nuqs-parsers";

export const meta: MetaFunction = () => {
  return [
    { title: "Ability Order - Deadlock API" },
    {
      name: "description",
      content: "Ability upgrade order mind map for Heroes in Deadlock",
    },
  ];
};

export default function AbilityOrder() {
  const [heroId, setHeroId] = useQueryState(
    "hero_id",
    parseAsInteger.withDefault(15),
  );
  const [minRankId, setMinRankId] = useQueryState(
    "min_rank",
    parseAsInteger.withDefault(0),
  );
  const [maxRankId, setMaxRankId] = useQueryState(
    "max_rank",
    parseAsInteger.withDefault(116),
  );
  const [gameMode, setGameMode] = useQueryState("game_mode", parseAsGameMode);
  const [[startDate, endDate], setDateRange] = useQueryState(
    "date_range",
    parseAsDayjsRange.withDefault([PATCHES[0].startDate, PATCHES[0].endDate]),
  );
  const [minMatches, setMinMatches] = useQueryState(
    "min_matches",
    parseAsInteger.withDefault(20),
  );
  const [itemSelections, setItemSelections] = useState<Map<number, TriState>>(
    new Map(),
  );

  const includeItemIds = useMemo(
    () =>
      [...itemSelections.entries()]
        .filter(([_, s]) => s === "included")
        .map(([id]) => id),
    [itemSelections],
  );
  const excludeItemIds = useMemo(
    () =>
      [...itemSelections.entries()]
        .filter(([_, s]) => s === "excluded")
        .map(([id]) => id),
    [itemSelections],
  );

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Ability Order</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Explore the most common ability upgrade paths and their win rates
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
        <Filter.MinMatches
          value={minMatches}
          onChange={setMinMatches}
          min={0}
        />
        <ItemSelectorTriState
          selections={itemSelections}
          onSelectionsChange={setItemSelections}
          label="Items"
        />
        <Filter.PatchOrDate
          startDate={startDate}
          endDate={endDate}
          onDateChange={(s, e) => setDateRange([s, e])}
        />
      </Filter.Root>

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
    </div>
  );
}
