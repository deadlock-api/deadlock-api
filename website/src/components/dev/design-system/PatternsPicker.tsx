import { Specimen, Variants } from "~/components/dev/design-system/Specimen";
import type { Pickable, PickerTriState } from "~/components/patterns/picker/picker";
import { PickerGrid, PickerGridGroup, PickerGridSearch, PickerGridTile } from "~/components/patterns/picker/PickerGrid";
import { type PickerSelectionProps, usePicker } from "~/components/patterns/picker/usePicker";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";

const FRUIT: readonly (Pickable & { kind: "Tree" | "Vine" })[] = [
  { id: 1, name: "Apple", kind: "Tree" },
  { id: 2, name: "Cherry", kind: "Tree" },
  { id: 3, name: "Lemon", kind: "Tree" },
  { id: 4, name: "Mango", kind: "Tree" },
  { id: 5, name: "Olive", kind: "Tree" },
  { id: 6, name: "Peach", kind: "Tree" },
  { id: 7, name: "Plum", kind: "Tree" },
  { id: 8, name: "Grape", kind: "Vine" },
  { id: 9, name: "Kiwi", kind: "Vine" },
  { id: 10, name: "Melon", kind: "Vine" },
  { id: 11, name: "Passion fruit", kind: "Vine" },
];

/** One `usePicker` over fruit, drawn flat or in two groups. */
function PickerDemo({
  choices = FRUIT,
  size = "default",
  layout = "flat",
  meta = "none",
  disabledIds,
  ...selection
}: PickerSelectionProps & {
  choices?: typeof FRUIT;
  size?: "sm" | "default" | "lg";
  layout?: "flat" | "grouped";
  meta?: "none" | "price";
  disabledIds?: ReadonlySet<number>;
}) {
  const picker = usePicker({ ...selection, choices, disabledIds });
  const tile = (fruit: (typeof FRUIT)[number]) => (
    <PickerGridTile
      key={fruit.id}
      choice={fruit}
      media={
        <Avatar className="size-full">
          <AvatarFallback>{fruit.name.slice(0, 2)}</AvatarFallback>
        </Avatar>
      }
      title={picker.isDisabled(fruit.id) ? `${fruit.name}: out of season` : undefined}
    >
      {meta === "price" ? `${fruit.id * 40}¢` : undefined}
    </PickerGridTile>
  );
  return (
    <div className="flex flex-col gap-2">
      <PickerGridSearch picker={picker} aria-label="Search fruit" placeholder="Search fruit…" />
      <PickerGrid picker={picker} size={size} aria-label="Fruit">
        {layout === "flat"
          ? picker.matches.map(tile)
          : (["Tree", "Vine"] as const).map((kind) => {
              const group = picker.matches.filter((fruit) => fruit.kind === kind);
              return (
                group.length > 0 && (
                  <PickerGridGroup key={kind} label={kind} hint={`${group.length}`}>
                    {group.map(tile)}
                  </PickerGridGroup>
                )
              );
            })}
      </PickerGrid>
    </div>
  );
}

export function PatternsPicker() {
  return (
    <Specimen
      name="PickerGrid"
      source="patterns/picker/PickerGrid · patterns/picker/usePicker · patterns/picker/picker"
      note="The grid every picker draws (HeroGrid, ItemGrid): PickerGrid + one PickerGridTile per choice of picker.matches, optionally in PickerGridGroups (a heading row over rows of their own), with PickerGridSearch above. Behaviour lives in usePicker: search, selection (single, multiple, tri-state with value / defaultValue / onValueChange), disabledIds, enterPicks, the keyboard cursor. Five a row; size sm (chart sidebar), default (hero popover), lg (larger art, names on two lines: the item shop). A tile's state is a ring plus a corner mark (check, plus, minus), and a tri-state tile's name says it; media is the tile's art, children a line under the name. Keyboard: WAI-ARIA grid, one tab stop, arrows follow the rows as drawn across groups, Home / End, Page Up / Down, Enter or Space picks; in the search box Enter picks the first match and ArrowDown enters the grid."
      className="grid gap-4 sm:grid-cols-2"
    >
      <Variants label="single" className="block max-w-80">
        <PickerDemo defaultValue={3} />
      </Variants>
      <Variants label="tri-state, grouped" className="block max-w-80">
        <PickerDemo
          selection="tri-state"
          layout="grouped"
          defaultValue={
            new Map<number, PickerTriState>([
              [2, "included"],
              [9, "excluded"],
            ])
          }
        />
      </Variants>
      <Variants label='multiple, size="lg", a line under each name' className="block max-w-96">
        <PickerDemo selection="multiple" size="lg" meta="price" defaultValue={[1, 11]} />
      </Variants>
      <Variants label='size="sm", disabled choices' className="block max-w-64">
        <PickerDemo selection="multiple" size="sm" disabledIds={new Set([4, 5])} />
      </Variants>
      <Variants label="Nothing to pick" className="block max-w-80">
        <PickerDemo choices={[]} />
      </Variants>
    </Specimen>
  );
}
