import { useQuery } from "@tanstack/react-query";
import type { ItemSlotType } from "deadlock_api_client";
import { useState } from "react";

import { Specimen, Variants } from "~/components/dev/design-system/Specimen";
import { ChartHeroSelector } from "~/components/domain/selectors/ChartHeroSelector";
import { HeroSelectionGrid, HeroSelector, HeroSelectorMultiple } from "~/components/domain/selectors/HeroSelector";
import { ItemSelectorMultiple } from "~/components/domain/selectors/ItemSelector";
import { ItemSlotSelector } from "~/components/domain/selectors/ItemSlotSelector";
import { ItemTierSelector } from "~/components/domain/selectors/ItemTierSelector";
import { MatchTimeRangeSelector } from "~/components/domain/selectors/MatchTimeRangeSelector";
import { ModeSelector } from "~/components/domain/selectors/ModeSelector";
import { RankRangeSelector } from "~/components/domain/selectors/RankRangeSelector";
import { SeasonPatchDatePicker } from "~/components/domain/selectors/SeasonPatchDatePicker";
import { Field } from "~/components/ui/field";
import type { Dayjs } from "~/dayjs";
import { PATCHES } from "~/lib/constants";
import type { Mode } from "~/lib/game-mode";
import { heroesQueryOptions } from "~/queries/asset-queries";

type TimeRange = [number | undefined, number | undefined];

export function DomainSelectors() {
  const { data: heroes = [] } = useQuery({
    ...heroesQueryOptions,
    select: (all) => all.filter((hero) => hero.in_development !== true).sort((a, b) => a.name.localeCompare(b.name)),
  });
  const roster = heroes.slice(0, 15);
  const rosterIds = roster.map((hero) => hero.id);
  const availableIds = rosterIds.slice(0, 12);

  const [anyHero, setAnyHero] = useState<number | null>(null);
  const [requiredHero, setRequiredHero] = useState<number | null>(1);
  const [included, setIncluded] = useState<number[]>([]);
  const [excluded, setExcluded] = useState<number[]>([2, 7]);
  const [gridHero, setGridHero] = useState<number | null>(null);
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const [chartHeroes, setChartHeroes] = useState<number[]>([]);
  const [items, setItems] = useState<number[]>([1548066885, 968099481]);
  const [slots, setSlots] = useState<ItemSlotType[]>(["weapon"]);
  const [itemTiers, setItemTiers] = useState<number[]>([1, 2]);
  const [mode, setMode] = useState<Mode>("normal_all");
  const [ranks, setRanks] = useState<[number, number]>([0, 116]);
  const [highRanks, setHighRanks] = useState<[number, number]>([91, 116]);
  const [matchTime, setMatchTime] = useState<TimeRange>([undefined, undefined]);
  const [buyTime, setBuyTime] = useState<TimeRange>([0, 600]);
  const [dates, setDates] = useState<{ startDate?: Dayjs; endDate?: Dayjs }>({
    startDate: PATCHES[0].startDate,
    endDate: PATCHES[0].endDate,
  });

  const selectGridHero = (ids: number[]) => setGridHero(ids.find((id) => id !== gridHero) ?? gridHero);

  return (
    <>
      <Specimen
        name="HeroSelector"
        source="domain/selectors/HeroSelector"
        note="One hero, as a FilterCell with a searchable portrait grid. allowNull adds Any Hero; a defaultValue makes the cell active (and resettable) whenever another hero is picked. In a filter bar, use Filter.Hero."
      >
        <Variants>
          <HeroSelector value={anyHero} onValueChange={setAnyHero} allowNull />
          <HeroSelector
            value={requiredHero}
            defaultValue={1}
            onValueChange={(id) => {
              if (id != null) setRequiredHero(id);
            }}
          />
        </Variants>
      </Specimen>

      <Specimen
        name="HeroSelectorMultiple"
        source="domain/selectors/HeroSelector"
        note="Any number of heroes, as a FilterCell with a checklist: the include and exclude lists of hero combinations."
      >
        <Variants>
          <HeroSelectorMultiple label="Include" emptyLabel="Any" value={included} onValueChange={setIncluded} />
          <HeroSelectorMultiple label="Exclude" emptyLabel="None" value={excluded} onValueChange={setExcluded} />
        </Variants>
      </Specimen>

      <Specimen
        name="HeroSelectionGrid"
        source="domain/selectors/HeroSelector"
        note="The portrait grid inside HeroSelector and ChartHeroSelector. Use it directly only for a new kind of hero picker; disabledHeroIds marks heroes without data, onHeroHighlight reports hover and focus."
        className="grid gap-4 sm:grid-cols-2"
      >
        <Variants label={`Default · highlighted: ${highlighted ?? "none"}`} className="block max-w-80">
          <HeroSelectionGrid
            heroes={roster.slice(0, 10)}
            value={gridHero == null ? [] : [gridHero]}
            onValueChange={selectGridHero}
            onHeroHighlight={setHighlighted}
          />
        </Variants>
        <Variants label='size="sm", with disabled heroes' className="block max-w-80">
          <HeroSelectionGrid
            size="sm"
            heroes={roster.slice(0, 10)}
            value={gridHero == null ? [] : [gridHero]}
            onValueChange={selectGridHero}
            disabledHeroIds={new Set(rosterIds.slice(7, 10))}
          />
        </Variants>
      </Specimen>

      <Specimen
        name="ChartHeroSelector"
        source="domain/selectors/ChartHeroSelector"
        note="The roster beside a multi-series hero chart (the aside of ChartSidebarLayout): toggles which heroes are drawn. Heroes missing from availableHeroIds are disabled."
      >
        <ChartHeroSelector
          heroes={roster}
          availableHeroIds={availableIds}
          value={chartHeroes}
          onValueChange={setChartHeroes}
          className="max-w-xs"
        />
      </Specimen>

      <Specimen
        name="ItemSelectorMultiple"
        source="domain/selectors/ItemSelector"
        note="Any number of shop items as chips with a searchable list, sorted by tier. Wrap it in a Field for its label."
      >
        <Variants className="items-start">
          <Field label="Items">
            <ItemSelectorMultiple value={items} onValueChange={setItems} />
          </Field>
          <Field label="Nothing chosen">
            <ItemSelectorMultiple value={[]} onValueChange={setItems} />
          </Field>
        </Variants>
      </Specimen>

      <Specimen
        name="ItemSlotSelector and ItemTierSelector"
        source="domain/selectors/ItemSlotSelector · domain/selectors/ItemTierSelector"
        note="Multi-select chips that narrow an item table by slot and by tier. Each brings its own Field label."
      >
        <Variants className="items-start gap-4">
          <ItemSlotSelector value={slots} onValueChange={setSlots} />
          <ItemTierSelector value={itemTiers} onValueChange={setItemTiers} />
        </Variants>
      </Specimen>

      <Specimen
        name="ModeSelector"
        source="domain/selectors/ModeSelector"
        note="Game mode and match mode as one choice, so only pairs that return data are offered. MODE_CONFIG maps the value to the API's game_mode and match_mode. With a rank range beside it, use Filter.ModeWithRank."
      >
        <Variants>
          <ModeSelector value={mode} onValueChange={setMode} />
        </Variants>
      </Specimen>

      <Specimen
        name="RankRangeSelector"
        source="domain/selectors/RankRangeSelector"
        note="A badge range (0 to 116) with a two-thumb slider and Low / Mid / High / Top presets. defaultValue sets what counts as inactive and what reset returns to."
      >
        <Variants>
          <RankRangeSelector value={ranks} onValueChange={([min, max]) => setRanks([min, max])} />
          <RankRangeSelector
            value={highRanks}
            onValueChange={([min, max]) => setHighRanks([min, max])}
            defaultValue={[91, 116]}
          />
        </Variants>
      </Specimen>

      <Specimen
        name="MatchTimeRangeSelector"
        source="domain/selectors/MatchTimeRangeSelector"
        note="A window of in-game time in seconds; undefined at either end means open. Filter.TimeRange and Filter.MatchDuration are this component with their labels and presets."
      >
        <Variants>
          <MatchTimeRangeSelector value={matchTime} onValueChange={([min, max]) => setMatchTime([min, max])} />
          <MatchTimeRangeSelector
            value={buyTime}
            onValueChange={([min, max]) => setBuyTime([min, max])}
            label="Bought at"
            title="Purchase Time Window"
            max={40 * 60}
            presets={[]}
          />
        </Variants>
      </Specimen>

      <Specimen
        name="SeasonPatchDatePicker"
        source="domain/selectors/SeasonPatchDatePicker"
        note="A date range picked as a ranked season, a patch or custom dates; onValueChange also carries the previous period for comparisons. Filter.SeasonPatchDate is this component; defaultValue is the range the reset returns to."
      >
        <Variants>
          <SeasonPatchDatePicker
            value={dates}
            onValueChange={({ startDate, endDate }) => setDates({ startDate, endDate })}
            defaultTab="patch"
            defaultValue={{ startDate: PATCHES[0].startDate, endDate: PATCHES[0].endDate }}
          />
        </Variants>
      </Specimen>
    </>
  );
}
