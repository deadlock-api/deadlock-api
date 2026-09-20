import { useQuery } from "@tanstack/react-query";
import { SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { HeroImage } from "~/components/domain/assets/HeroImage";
import { HeroName } from "~/components/domain/assets/HeroName";
import { FilterCell } from "~/components/patterns/filter-bar/FilterCell";
import { FilteredSelectList, FilteredSelectOption } from "~/components/patterns/filter-bar/FilteredSelectPopover";
import { useControllableState } from "~/components/ui/hooks/use-controllable-state";
import { Input } from "~/components/ui/input";
import { OptionRow } from "~/components/ui/option-row";
import { cn } from "~/lib/utils";
import { heroesQueryOptions, type SlimHero } from "~/queries/asset-queries";

function useHeroes() {
  const { data: sortedHeroes = [], isLoading } = useQuery({
    ...heroesQueryOptions,
    select: (heroes) => heroes.filter((h) => h.in_development !== true).sort((a, b) => a.name.localeCompare(b.name)),
  });

  return { sortedHeroes, isLoading };
}

export function HeroSelector({
  value: valueProp,
  defaultValue,
  onValueChange,
  allowSelectNull,
  label,
  className,
  ...props
}: Omit<
  React.ComponentProps<typeof FilterCell>,
  "label" | "value" | "defaultValue" | "active" | "onReset" | "icon" | "children"
> & {
  /** `null` is "any hero". */
  value?: number | null;
  /** The hero it starts on when uncontrolled, and the one the reset returns to. */
  defaultValue?: number | null;
  onValueChange?: (heroId: number | null) => void;
  allowSelectNull?: boolean;
  label?: string;
}) {
  const [selectedHero, setSelectedHero] = useControllableState<number | null>({
    value: valueProp,
    defaultValue: defaultValue ?? null,
    onValueChange,
  });
  const { sortedHeroes } = useHeroes();
  const [search, setSearch] = useState("");

  const currentHero = selectedHero ? sortedHeroes.find((h: SlimHero) => h.id === selectedHero) : undefined;

  const filteredHeroes = useMemo(() => {
    if (!search) return sortedHeroes;
    const lower = search.toLowerCase();
    return sortedHeroes.filter((h: SlimHero) => h.name.toLowerCase().includes(lower));
  }, [sortedHeroes, search]);

  const isActive = (selectedHero ?? null) !== (defaultValue ?? null);

  const icon = currentHero ? (
    <HeroImage heroId={currentHero.id} className="size-4 shrink-0 object-contain" />
  ) : undefined;

  const displayValue = currentHero ? currentHero.name : "Any";

  const select = (heroId: number | null) => {
    setSelectedHero(heroId);
    setSearch("");
  };

  return (
    <FilterCell
      label={label ?? "Hero"}
      value={displayValue}
      active={isActive}
      onReset={allowSelectNull || defaultValue != null ? () => select(defaultValue ?? null) : undefined}
      icon={icon}
      className={className}
      contentClassName="w-80 p-0"
      {...props}
    >
      <div className="relative border-b p-2">
        <SearchIcon className="absolute start-4 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search heroes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          size="sm"
          className="ps-7 text-sm"
        />
      </div>
      <div className="flex max-h-80 flex-col gap-1 overflow-y-auto p-2">
        {allowSelectNull && !search && (
          <OptionRow selected={selectedHero == null} onClick={() => select(null)}>
            Any Hero
          </OptionRow>
        )}
        <HeroSelectionGrid
          heroes={filteredHeroes}
          value={selectedHero == null ? [] : [selectedHero]}
          onValueChange={(ids) => select(ids.find((id) => id !== selectedHero) ?? selectedHero)}
        />
        {filteredHeroes.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">No hero matches.</p>
        )}
      </div>
    </FilterCell>
  );
}

const NO_HEROES: number[] = [];

export function HeroSelectorMultiple({
  label = "Heroes",
  emptyLabel = "Any",
  value: valueProp,
  defaultValue = NO_HEROES,
  onValueChange,
  className,
  ...props
}: Omit<
  React.ComponentProps<typeof FilterCell>,
  "label" | "value" | "defaultValue" | "active" | "onReset" | "children"
> & {
  label?: string;
  emptyLabel?: string;
  value?: number[];
  defaultValue?: number[];
  onValueChange?: (heroIds: number[]) => void;
}) {
  const [selectedHeroes, onHeroesSelected] = useControllableState({
    value: valueProp,
    defaultValue,
    onValueChange,
  });
  const { sortedHeroes, isLoading } = useHeroes();

  if (isLoading) {
    return null;
  }

  const count = selectedHeroes.length;
  const value = count === 0 ? emptyLabel : count === 1 ? "1 hero" : `${count} heroes`;

  return (
    <FilterCell
      label={label}
      value={value}
      active={count > 0}
      onReset={() => onHeroesSelected([])}
      className={className}
      contentClassName="max-h-100 w-56 overflow-y-auto p-2"
      {...props}
    >
      <FilteredSelectList value={selectedHeroes} onValueChange={onHeroesSelected}>
        {sortedHeroes.map((hero: SlimHero) => (
          <FilteredSelectOption key={hero.id} value={hero.id}>
            <HeroImage heroId={hero.id} className="size-5 shrink-0 object-contain" />
            <HeroName heroId={hero.id} className="truncate text-sm" />
          </FilteredSelectOption>
        ))}
      </FilteredSelectList>
    </FilterCell>
  );
}

/** Shared portrait grid for single-hero filters and multi-hero chart selection. */
export function HeroSelectionGrid({
  heroes,
  value: valueProp,
  defaultValue = NO_HEROES,
  onValueChange,
  disabledHeroIds,
  onHeroHighlight,
  size = "default",
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "defaultValue" | "children"> & {
  heroes: readonly { id: number; name: string }[];
  /** The pressed portraits. A press toggles its hero in or out of the list. */
  value?: readonly number[];
  defaultValue?: readonly number[];
  onValueChange?: (heroIds: number[]) => void;
  disabledHeroIds?: ReadonlySet<number>;
  onHeroHighlight?: (id: number | null) => void;
  /** `sm` packs the portraits for a chart sidebar. */
  size?: "sm" | "default";
}) {
  const [selectedHeroes, setSelectedHeroes] = useControllableState<readonly number[]>({
    value: valueProp,
    defaultValue,
    onValueChange: onValueChange as ((heroIds: readonly number[]) => void) | undefined,
  });
  const toggle = (id: number) =>
    setSelectedHeroes(selectedHeroes.includes(id) ? selectedHeroes.filter((h) => h !== id) : [...selectedHeroes, id]);
  const small = size === "sm";
  return (
    <div
      data-slot="hero-selection-grid"
      data-size={small ? "sm" : "default"}
      className={cn("grid grid-cols-5 gap-1", className)}
      {...props}
    >
      {heroes.map((hero) => (
        // ds-allow raw-button: hero portrait tile, a bespoke hit area in a selection grid
        <button
          key={hero.id}
          type="button"
          title={disabledHeroIds?.has(hero.id) ? `${hero.name}: no data for these filters` : hero.name}
          aria-label={hero.name}
          aria-pressed={selectedHeroes.includes(hero.id)}
          disabled={disabledHeroIds?.has(hero.id)}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-1 rounded-md p-1.5 outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default disabled:opacity-40",
            small && "gap-0.5 p-1",
            selectedHeroes.includes(hero.id) && "bg-primary/15 ring-1 ring-primary/40 ring-inset",
          )}
          onClick={() => toggle(hero.id)}
          onMouseEnter={onHeroHighlight ? () => onHeroHighlight(hero.id) : undefined}
          onMouseLeave={onHeroHighlight ? () => onHeroHighlight(null) : undefined}
          onFocus={onHeroHighlight ? () => onHeroHighlight(hero.id) : undefined}
          onBlur={onHeroHighlight ? () => onHeroHighlight(null) : undefined}
        >
          <HeroImage heroId={hero.id} className={cn("size-9 shrink-0 object-contain", small && "size-8")} />
          <span
            className={cn(
              "w-full truncate text-center text-3xs leading-tight text-muted-foreground",
              small && "text-3xs",
            )}
          >
            {hero.name}
          </span>
        </button>
      ))}
    </div>
  );
}
