import { useState } from "react";

import { Specimen, Variants } from "~/components/dev/design-system/Specimen";
import { Filter } from "~/components/domain/filters";
import type { TriState } from "~/components/patterns/filter-bar/TriStateSelector";
import { PATCHES } from "~/lib/constants";
import type { DateRange } from "~/lib/date-filter-preference";
import type { Mode } from "~/lib/game-mode";

type TimeRange = [number | undefined, number | undefined];

const DEFAULT_DATES: DateRange = [PATCHES[0].startDate, PATCHES[0].endDate];

export function DomainFilters() {
  const [hero, setHero] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("normal_ranked");
  const [ranks, setRanks] = useState<[number, number]>([0, 116]);
  const [minMatches, setMinMatches] = useState(20);
  const [itemStates, setItemStates] = useState(new Map<number, TriState>());
  const [dates, setDates] = useState<DateRange>(DEFAULT_DATES);
  const [duration, setDuration] = useState<TimeRange>([undefined, undefined]);

  const [killTime, setKillTime] = useState<TimeRange>([undefined, 600]);

  return (
    <Specimen
      name="Filter namespace"
      source="domain/filters"
      note="Filter.Root is FilterBar; the members are the game's filters, each a FilterCell. Pages own the URL state and pass value and onValueChange. Filter.ModeWithRank hides the rank range in Brawl, which is never ranked."
    >
      <Variants label="Hero · ModeWithRank · MinMatches · ItemsTriState · SeasonPatchDate · MatchDuration">
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
          <Filter.ItemsTriState value={itemStates} onValueChange={setItemStates} />
          <Filter.SeasonPatchDate
            value={{ startDate: dates[0], endDate: dates[1] }}
            onValueChange={({ startDate, endDate }) => setDates([startDate, endDate])}
            defaultValue={{ startDate: DEFAULT_DATES[0], endDate: DEFAULT_DATES[1] }}
          />
          <Filter.MatchDuration value={duration} onValueChange={([min, max]) => setDuration([min, max])} />
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
