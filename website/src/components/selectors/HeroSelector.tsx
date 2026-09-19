import { useQuery } from "@tanstack/react-query";
import { SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { FilterCell } from "~/components/Filter/FilterCell";
import { HeroImage } from "~/components/HeroImage";
import { HeroName } from "~/components/HeroName";
import { FilteredSelectList } from "~/components/selectors/FilteredSelectPopover";
import { Input } from "~/components/ui/input";
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
  onHeroSelected,
  selectedHero,
  allowSelectNull,
  label,
  defaultValue,
}: {
  onHeroSelected: (selectedHero: number | null) => void;
  selectedHero?: number | null;
  allowSelectNull?: boolean;
  label?: string;
  defaultValue?: number | null;
}) {
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
    onHeroSelected(heroId);
    setSearch("");
  };

  return (
    <FilterCell
      label={label ?? "Hero"}
      value={displayValue}
      active={isActive}
      onReset={allowSelectNull || defaultValue != null ? () => select(defaultValue ?? null) : undefined}
      icon={icon}
      className="w-80 p-0"
    >
      <div className="relative border-b p-2">
        <SearchIcon className="absolute top-1/2 left-4 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search heroes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 pl-7 text-sm"
        />
      </div>
      <div className="max-h-80 overflow-y-auto p-2">
        {allowSelectNull && !search && (
          <button
            type="button"
            className={cn(
              "mb-1 w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
              selectedHero == null ? "font-medium text-foreground" : "text-muted-foreground",
            )}
            onClick={() => select(null)}
          >
            Any Hero
          </button>
        )}
        <HeroSelectionGrid
          heroes={filteredHeroes}
          selectedHeroes={selectedHero == null ? [] : [selectedHero]}
          onHeroSelected={select}
        />
        {filteredHeroes.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">No hero matches.</p>
        )}
      </div>
    </FilterCell>
  );
}

export function HeroSelectorMultiple({
  label,
  emptyLabel,
  selectedHeroes,
  onHeroesSelected,
}: {
  label: string;
  emptyLabel: string;
  selectedHeroes: number[];
  onHeroesSelected: (selectedHeroes: number[]) => void;
}) {
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
      className="max-h-[400px] w-56 overflow-y-auto p-2"
    >
      <FilteredSelectList
        items={sortedHeroes}
        selectedIds={selectedHeroes}
        onSelectedIdsChange={onHeroesSelected}
        getId={(hero: SlimHero) => hero.id}
        renderRow={(hero: SlimHero) => (
          <>
            <HeroImage heroId={hero.id} className="size-5 shrink-0 object-contain" />
            <HeroName heroId={hero.id} className="truncate text-sm" />
          </>
        )}
      />
    </FilterCell>
  );
}

/** Shared portrait grid for single-hero filters and multi-hero chart selection. */
export function HeroSelectionGrid({
  heroes,
  selectedHeroes,
  onHeroSelected,
  disabledHeroIds,
  onHeroHighlight,
  compact = false,
  className,
}: {
  heroes: readonly { id: number; name: string }[];
  selectedHeroes: readonly number[];
  onHeroSelected: (id: number) => void;
  disabledHeroIds?: ReadonlySet<number>;
  onHeroHighlight?: (id: number | null) => void;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-5 gap-1", className)}>
      {heroes.map((hero) => (
        <button
          key={hero.id}
          type="button"
          title={disabledHeroIds?.has(hero.id) ? `${hero.name}: no data for these filters` : hero.name}
          aria-label={hero.name}
          aria-pressed={selectedHeroes.includes(hero.id)}
          disabled={disabledHeroIds?.has(hero.id)}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-1 rounded-md p-1.5 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default disabled:opacity-40",
            compact && "gap-0.5 p-1",
            selectedHeroes.includes(hero.id) && "bg-primary/15 ring-1 ring-primary/40 ring-inset",
          )}
          onClick={() => onHeroSelected(hero.id)}
          onMouseEnter={onHeroHighlight ? () => onHeroHighlight(hero.id) : undefined}
          onMouseLeave={onHeroHighlight ? () => onHeroHighlight(null) : undefined}
          onFocus={onHeroHighlight ? () => onHeroHighlight(hero.id) : undefined}
          onBlur={onHeroHighlight ? () => onHeroHighlight(null) : undefined}
        >
          <HeroImage heroId={hero.id} className={cn("size-9 shrink-0 object-contain", compact && "size-8")} />
          <span
            className={cn(
              "w-full truncate text-center text-[10px] leading-tight text-muted-foreground",
              compact && "text-[10px]",
            )}
          >
            {hero.name}
          </span>
        </button>
      ))}
    </div>
  );
}
