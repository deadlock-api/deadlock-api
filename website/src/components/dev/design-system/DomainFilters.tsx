import { useState } from "react";

import { Specimen, Variants } from "~/components/dev/design-system/Specimen";
import { Filter } from "~/components/domain/filters";
import type { TriState } from "~/components/patterns/filter-bar/TriStateSelector";
import { PATCHES } from "~/lib/constants";
import type { Mode } from "~/lib/game-mode";
import type { Period } from "~/lib/period";

type TimeRange = [number | undefined, number | undefined];

const DEFAULT_PERIOD: Period = { kind: "patch", id: PATCHES[0].id };

export function DomainFilters() {
  const [hero, setHero] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("normal_ranked");
  const [ranks, setRanks] = useState<[number, number]>([0, 116]);
  const [minMatches, setMinMatches] = useState(20);
  const [itemStates, setItemStates] = useState(new Map<number, TriState>());
  const [tagStates, setTagStates] = useState(new Map<number, TriState>());
  const [language, setLanguage] = useState<number | null>(null);
  const [updated, setUpdated] = useState<number | null>(null);
  const [period, setPeriod] = useState<Period>(DEFAULT_PERIOD);
  const [duration, setDuration] = useState<TimeRange>([undefined, undefined]);

  const [killTime, setKillTime] = useState<TimeRange>([undefined, 600]);

  return (
    <Specimen
      name="Filter namespace"
      source="domain/filters"
      note="Filter.Root is FilterBar; the members are the game's filters, each a FilterCell. Pages own the URL state and pass value and onValueChange. Filter.ModeWithRank hides the rank range in Brawl, which is never ranked. Filter.BuildTags, BuildLanguage and BuildUpdated filter builds by what they are; the page passes the tags and languages its builds use, most used first."
    >
      <Variants label="Hero · ModeWithRank · MinMatches · Item (tri-state) · SeasonPatchDate · MatchDuration">
        <Filter.Root>
          <Filter.Hero value={hero} onValueChange={setHero} allowNull />
          <Filter.ModeWithRank
            value={{ mode, rank: ranks }}
            onValueChange={({ mode: nextMode, rank }) => {
              setMode(nextMode);
              setRanks([rank[0], rank[1]]);
            }}
          />
          <Filter.MinMatches value={minMatches} onValueChange={setMinMatches} defaultValue={20} />
          <Filter.Item selection="tri-state" value={itemStates} onValueChange={setItemStates} />
          <Filter.SeasonPatchDate value={period} onValueChange={setPeriod} defaultValue={DEFAULT_PERIOD} />
          <Filter.MatchDuration value={duration} onValueChange={([min, max]) => setDuration([min, max])} />
        </Filter.Root>
      </Variants>
      <Variants label="BuildTags · BuildLanguage · BuildUpdated">
        <Filter.Root>
          {/* Power Surge (an ability) and Toxic Bullets (an item), as a Seven build tags them. */}
          <Filter.BuildTags tagIds={[539192269, 3696726732]} value={tagStates} onValueChange={setTagStates} />
          <Filter.BuildLanguage languages={[0, 8, 6]} value={language} onValueChange={setLanguage} />
          <Filter.BuildUpdated value={updated} onValueChange={setUpdated} />
        </Filter.Root>
      </Variants>
      <Variants label="TimeRange (the kill heatmap's bar)">
        <Filter.Root>
          <Filter.TimeRange
            value={killTime}
            onValueChange={([min, max]) => setKillTime([min, max])}
            label="Match Time"
            title="Kill/Death Time Window"
          />
        </Filter.Root>
      </Variants>
    </Specimen>
  );
}
