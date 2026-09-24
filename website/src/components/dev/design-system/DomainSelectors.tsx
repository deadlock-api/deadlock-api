import { useQuery } from "@tanstack/react-query";
import type { ItemSlotType } from "deadlock_api_client";
import { useState } from "react";

import { Specimen, Variants } from "~/components/dev/design-system/Specimen";
import { ChartHeroSelector } from "~/components/domain/selectors/ChartHeroSelector";
import type { HeroTriState, PickableHero } from "~/components/domain/selectors/hero-picker";
import { HeroGrid, HeroGridSearch, HeroGridTile } from "~/components/domain/selectors/HeroGrid";
import { HeroSelector } from "~/components/domain/selectors/HeroSelector";
import type { ItemSlotTab } from "~/components/domain/selectors/item-picker";
import {
  ItemGrid,
  ItemGridSearch,
  ItemGridTier,
  ItemGridTile,
  ItemSlotTabs,
} from "~/components/domain/selectors/ItemGrid";
import { ItemSelector } from "~/components/domain/selectors/ItemSelector";
import { ItemSlotSelector } from "~/components/domain/selectors/ItemSlotSelector";
import { ItemTierSelector } from "~/components/domain/selectors/ItemTierSelector";
import { MatchTimeRangeSelector } from "~/components/domain/selectors/MatchTimeRangeSelector";
import { ModeSelector } from "~/components/domain/selectors/ModeSelector";
import { RankRangeSelector } from "~/components/domain/selectors/RankRangeSelector";
import { SeasonPatchDatePicker } from "~/components/domain/selectors/SeasonPatchDatePicker";
import { type HeroSelectionProps, useHeroPicker } from "~/components/domain/selectors/useHeroPicker";
import { type ItemSelectionProps, useItemPicker, useShopItems } from "~/components/domain/selectors/useItemPicker";
import type { PickerTriState } from "~/components/patterns/picker/picker";
import { Separator } from "~/components/ui/separator";
import type { Dayjs } from "~/dayjs";
import { PATCHES } from "~/lib/constants";
import type { Mode } from "~/lib/game-mode";
import { heroesQueryOptions, type SlimUpgrade } from "~/queries/asset-queries";

type TimeRange = [number | undefined, number | undefined];

/** One `useHeroPicker` drawn by a search box, a `HeroGrid` and its tiles; `meta` puts a line under every name. */
function HeroGridDemo({
  heroes,
  disabledHeroIds,
  size = "default",
  search = "none",
  meta = "none",
  ...selection
}: HeroSelectionProps & {
  heroes: readonly PickableHero[];
  disabledHeroIds?: ReadonlySet<number>;
  size?: "sm" | "default";
  search?: "none" | "shown";
  meta?: "none" | "rate";
}) {
  const picker = useHeroPicker({ ...selection, heroes, disabledHeroIds });
  return (
    <div className="flex flex-col gap-2">
      {search === "shown" && <HeroGridSearch picker={picker} />}
      <HeroGrid picker={picker} size={size}>
        {picker.matches.map((hero) => (
          <HeroGridTile
            key={hero.id}
            hero={hero}
            title={picker.isDisabled(hero.id) ? `${hero.name}: no data for these filters` : undefined}
          >
            {meta === "rate" ? `${48 + ((hero.id * 7) % 50) / 10}%` : undefined}
          </HeroGridTile>
        ))}
      </HeroGrid>
    </div>
  );
}

/** One `useItemPicker` drawn as the item popover draws it; `meta` puts a made-up win rate under every name. */
function ItemGridDemo({
  items,
  disabledItemIds,
  defaultSlot,
  meta = "none",
  ...selection
}: ItemSelectionProps & {
  items: readonly SlimUpgrade[];
  disabledItemIds?: ReadonlySet<number>;
  defaultSlot?: ItemSlotTab;
  meta?: "none" | "rate";
}) {
  const picker = useItemPicker({ ...selection, items, disabledItemIds, defaultSlot });
  return (
    <div className="flex flex-col">
      <div className="p-2">
        <ItemGridSearch picker={picker} />
      </div>
      <Separator />
      <ItemSlotTabs picker={picker}>
        <ItemGrid picker={picker}>
          {picker.groups.map((group) => (
            <ItemGridTier key={group.tier} tier={group.tier} cost={group.cost}>
              {group.items.map((item) => (
                <ItemGridTile
                  key={item.id}
                  item={item}
                  title={picker.isDisabled(item.id) ? `${item.name}: no data for these filters` : undefined}
                >
                  {meta === "rate" ? `${48 + ((item.id * 7) % 50) / 10}%` : undefined}
                </ItemGridTile>
              ))}
            </ItemGridTier>
          ))}
        </ItemGrid>
      </ItemSlotTabs>
    </div>
  );
}

export function DomainSelectors() {
  const { data: heroes = [] } = useQuery({
    ...heroesQueryOptions,
    select: (all) => all.filter((hero) => !hero.in_development).sort((a, b) => a.name.localeCompare(b.name)),
  });
  const roster = heroes.slice(0, 15);
  const rosterIds = roster.map((hero) => hero.id);
  const availableIds = rosterIds.slice(0, 12);

  const [anyHero, setAnyHero] = useState<number | null>(null);
  const [requiredHero, setRequiredHero] = useState<number | null>(1);
  const [chosen, setChosen] = useState<number[]>([2, 7]);
  const [heroStates, setHeroStates] = useState<Map<number, HeroTriState>>(
    () =>
      new Map([
        [1, "included"],
        [2, "excluded"],
      ]),
  );
  const [gridHero, setGridHero] = useState<number | null>(null);
  const [chartHeroes, setChartHeroes] = useState<number[]>([]);
  const { items: shopItems } = useShopItems();
  const [items, setItems] = useState<number[]>([1548066885, 968099481]);
  const [oneItem, setOneItem] = useState<number | null>(null);
  const [itemStates, setItemStates] = useState<Map<number, PickerTriState>>(
    () =>
      new Map([
        [1548066885, "included"],
        [968099481, "excluded"],
      ]),
  );
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

  return (
    <>
      <Specimen
        name="HeroSelector"
        source="domain/selectors/HeroSelector"
        note="The one hero filter: a FilterCell whose popover is a search box over the HeroGrid. selection: single (closes on a pick; allowNull adds Any hero; a defaultValue makes the cell active and resettable whenever another hero is picked), multiple (a list), tri-state (a map of hero to included / excluded; the trigger reads +2 / -1). size sm for a toolbar. In a filter bar, use Filter.Hero."
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
          <HeroSelector selection="multiple" value={chosen} onValueChange={setChosen} />
          <HeroSelector selection="tri-state" value={heroStates} onValueChange={setHeroStates} />
          <HeroSelector selection="tri-state" size="sm" label="Toolbar" defaultValue={heroStates} />
        </Variants>
      </Specimen>

      <Specimen
        name="HeroGrid"
        source="domain/selectors/HeroGrid · domain/selectors/useHeroPicker"
        note="The portrait grid every hero picker draws, a PickerGrid over heroes: HeroGrid + one HeroGridTile per hero of picker.matches, with HeroGridSearch above. Behaviour lives in useHeroPicker (search, selection mode, keyboard cursor). Five a row always; the portraits shrink in a narrow container. A tile's state is a ring plus a corner mark (check, plus, minus), and a tri-state tile's name says it. Children put a line under the name (the Team Builder's sort value); disabledHeroIds are shown but cannot be picked, with the reason in title. Keyboard: WAI-ARIA grid, one tab stop, arrows move, Enter or Space picks; in the search box Enter picks the first match and ArrowDown enters the grid."
        className="grid gap-4 sm:grid-cols-2"
      >
        <Variants label="single, with search" className="block max-w-80">
          <HeroGridDemo heroes={roster} search="shown" value={gridHero} onValueChange={setGridHero} />
        </Variants>
        <Variants label="multiple" className="block max-w-80">
          <HeroGridDemo heroes={roster.slice(0, 10)} selection="multiple" defaultValue={rosterIds.slice(1, 4)} />
        </Variants>
        <Variants label="tri-state: neither, included, excluded" className="block max-w-80">
          <HeroGridDemo
            heroes={roster.slice(0, 10)}
            selection="tri-state"
            defaultValue={
              new Map<number, HeroTriState>([
                [rosterIds[1], "included"],
                [rosterIds[2], "excluded"],
              ])
            }
          />
        </Variants>
        <Variants label='size="sm", disabled heroes, a line under each name' className="block max-w-64">
          <HeroGridDemo
            heroes={roster.slice(0, 10)}
            size="sm"
            meta="rate"
            selection="multiple"
            defaultValue={rosterIds.slice(0, 2)}
            disabledHeroIds={new Set(rosterIds.slice(7, 10))}
          />
        </Variants>
        <Variants label="Nothing matches" className="block max-w-80">
          <HeroGridDemo heroes={[]} />
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
        name="ItemSelector"
        source="domain/selectors/ItemSelector"
        note="The one item filter: a FilterCell whose popover is a search box, the shop's slot tabs (All, Weapon, Vitality, Spirit, each with the count of its chosen items) and the tab's items grouped by tier (ItemGrid). Only items on sale. selection: single (closes on a pick; allowNull adds Any item), multiple (a list), tri-state (a map of item to included / excluded; the trigger reads +2 / -1). A list or tri-state popover lists every chosen item under the grid, whichever tab it is on, with Clear. Typing a search moves to All; clearing it returns to the tab it left. size sm for a toolbar. In a filter bar, use Filter.Item."
      >
        <Variants>
          <ItemSelector value={oneItem} onValueChange={setOneItem} allowNull />
          <ItemSelector selection="multiple" value={items} onValueChange={setItems} />
          <ItemSelector selection="multiple" emptyLabel="None" defaultValue={[]} />
          <ItemSelector selection="tri-state" value={itemStates} onValueChange={setItemStates} />
          <ItemSelector selection="tri-state" size="sm" label="Toolbar" defaultValue={itemStates} />
        </Variants>
      </Specimen>

      <Specimen
        name="ItemGrid"
        source="domain/selectors/ItemGrid · domain/selectors/useItemPicker · domain/selectors/item-picker"
        note="The item shop every item picker draws: ItemGridSearch, ItemSlotTabs around an ItemGrid, one ItemGridTier (Tier 1 · 800 souls, the cost from the items) per group of picker.groups, one ItemGridTile per item. A PickerGrid (size lg: icon and name on two lines, five a row). Behaviour lives in useItemPicker (usePicker plus the slot tab; items keep their order within a tier, so a list sorted by a stat stays sorted). Children of a tile are a line under the name (Build Flow's win rate); disabledItemIds are shown but cannot be picked."
        className="grid gap-4 sm:grid-cols-2"
      >
        <Variants label="tri-state, Weapon tab" className="block max-w-96">
          <ItemGridDemo
            items={shopItems}
            selection="tri-state"
            defaultValue={
              new Map<number, PickerTriState>([
                [1548066885, "included"],
                [968099481, "excluded"],
              ])
            }
          />
        </Variants>
        <Variants label="single, All tab, a line under each name, disabled items" className="block max-w-96">
          <ItemGridDemo
            items={shopItems.slice(0, 24)}
            defaultSlot="all"
            meta="rate"
            disabledItemIds={new Set(shopItems.slice(20, 24).map((item) => item.id))}
          />
        </Variants>
        <Variants label="Nothing to pick" className="block max-w-96">
          <ItemGridDemo items={[]} />
        </Variants>
      </Specimen>

      <Specimen
        name="ItemSlotSelector and ItemTierSelector"
        source="domain/selectors/ItemSlotSelector · domain/selectors/ItemTierSelector"
        note="Multi-select chips that narrow an item table by slot and by tier. With every chip on, pressing one keeps only that chip; releasing the last chip turns all back on. Each brings its own Field label."
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
