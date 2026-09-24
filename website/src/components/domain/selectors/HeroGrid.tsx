import { HeroImage } from "~/components/domain/assets/HeroImage";
import type { PickableHero } from "~/components/domain/selectors/hero-picker";
import type { HeroPicker } from "~/components/domain/selectors/useHeroPicker";
import { PickerGrid, PickerGridSearch, PickerGridTile } from "~/components/patterns/picker/PickerGrid";

/**
 * The portraits of a hero picker: a `PickerGrid` over heroes, five a row. Every hero selector draws its heroes with it:
 * the `HeroSelector` popover, the chart sidebar and the Team Builder's picker. Its behaviour comes from
 * `useHeroPicker` through `picker`; its children are one `HeroGridTile` per hero of `picker.matches`, in that order.
 * Without tiles it says that no hero matches the search.
 */
export function HeroGrid({
  picker,
  "aria-label": ariaLabel = "Heroes",
  ...props
}: Omit<React.ComponentProps<typeof PickerGrid>, "picker" | "size" | "emptyLabel"> & {
  picker: HeroPicker;
  /** `sm` packs the portraits for a chart sidebar. */
  size?: "sm" | "default";
}) {
  const term = picker.search.trim();
  return (
    <PickerGrid
      picker={picker}
      aria-label={ariaLabel}
      emptyLabel={term ? `No hero matches “${term}”.` : "No heroes."}
      {...props}
    />
  );
}

/**
 * One hero of a `HeroGrid`: its portrait and name, with the state marks of `PickerGridTile`. Children are an extra
 * line under the name, such as the number a list is sorted by. A hero in `disabledHeroIds` stays focusable but cannot
 * be picked; `title` gives the reason. Props and `ref` reach the button.
 */
export function HeroGridTile({
  hero,
  ...props
}: Omit<React.ComponentProps<typeof PickerGridTile>, "choice" | "media"> & { hero: PickableHero }) {
  return (
    <PickerGridTile
      choice={hero}
      media={<HeroImage heroId={hero.id} title="" className="size-full object-contain" />}
      {...props}
    />
  );
}

/**
 * The search box above a `HeroGrid`: it narrows `picker.matches`, Enter picks the first match and ArrowDown moves into
 * the grid. Props reach `SearchInput`.
 */
export function HeroGridSearch({
  placeholder = "Search heroes…",
  ...props
}: React.ComponentProps<typeof PickerGridSearch>) {
  return <PickerGridSearch aria-label="Search heroes" placeholder={placeholder} {...props} />;
}
