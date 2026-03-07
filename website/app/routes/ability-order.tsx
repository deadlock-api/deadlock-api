import { parseAsInteger, parseAsStringLiteral, useQueryState } from "nuqs";
import { useMemo, useState } from "react";
import type { MetaFunction } from "react-router";
import AbilityOrderTree from "~/components/ability-order/AbilityOrderTree";
import NumberSelector from "~/components/NumberSelector";
import { PatchOrDatePicker } from "~/components/PatchOrDatePicker";
import HeroSelector from "~/components/selectors/HeroSelector";
import { ItemSelectorTriState } from "~/components/selectors/ItemSelectorTriState";
import RankRangeSelector from "~/components/selectors/RankRangeSelector";
import { StringSelector } from "~/components/selectors/StringSelector";
import type { TriState } from "~/components/selectors/TriStateSelector";
import { Card, CardContent } from "~/components/ui/card";
import { PATCHES } from "~/lib/constants";
import { parseAsDayjsRange } from "~/lib/nuqs-parsers";

export const meta: MetaFunction = () => {
  return [
    { title: "Ability Order - Deadlock API" },
    { name: "description", content: "Ability upgrade order mind map for Heroes in Deadlock" },
  ];
};

const GAME_MODE_OPTIONS = [
  { value: "normal", label: "Normal" },
  { value: "street_brawl", label: "Street Brawl" },
];

export default function AbilityOrder() {
  const [heroId, setHeroId] = useQueryState("hero_id", parseAsInteger.withDefault(15));
  const [minRankId, setMinRankId] = useQueryState("min_rank", parseAsInteger.withDefault(0));
  const [maxRankId, setMaxRankId] = useQueryState("max_rank", parseAsInteger.withDefault(116));
  const [gameMode, setGameMode] = useQueryState(
    "game_mode",
    parseAsStringLiteral(["normal", "street_brawl"] as const).withDefault("normal"),
  );
  const [[startDate, endDate], setDateRange] = useQueryState(
    "date_range",
    parseAsDayjsRange.withDefault([PATCHES[0].startDate, PATCHES[0].endDate]),
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
    <>
      <h2 className="text-3xl font-bold text-center mb-2">Ability Order</h2>

      <Card className="mb-8">
        <CardContent>
          <div className="flex flex-wrap items-end gap-2 justify-center">
            <HeroSelector
              selectedHero={heroId}
              onHeroSelected={(id) => {
                if (id != null) setHeroId(id);
              }}
            />
            <StringSelector
              options={GAME_MODE_OPTIONS}
              onSelect={(v) => setGameMode(v as "normal" | "street_brawl")}
              selected={gameMode}
              label="Game Mode"
            />
            <NumberSelector value={minMatches} onChange={setMinMatches} label="Min Matches" step={10} min={0} />
            {gameMode !== "street_brawl" && (
              <>
                <RankRangeSelector
                  minRank={minRankId}
                  maxRank={maxRankId}
                  onRankChange={(min, max) => {
                    setMinRankId(min);
                    setMaxRankId(max);
                  }}
                />
              </>
            )}
            <ItemSelectorTriState
              selections={itemSelections}
              onSelectionsChange={setItemSelections}
              label="Items"
            />
            <PatchOrDatePicker
              patchDates={PATCHES}
              value={{ startDate, endDate }}
              onValueChange={({ startDate, endDate }) => setDateRange([startDate, endDate])}
            />
          </div>
        </CardContent>
      </Card>

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
    </>
  );
}
