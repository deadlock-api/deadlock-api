import { useQuery } from "@tanstack/react-query";
import type { HeroV2 } from "assets_deadlock_api_client";
import { SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { FilterPill } from "~/components/FilterPill";
import { HeroImage } from "~/components/HeroImage";
import { HeroName } from "~/components/HeroName";
import { FilteredSelectPopover } from "~/components/selectors/FilteredSelectPopover";
import { Input } from "~/components/ui/input";
import { heroesQueryOptions } from "~/queries/asset-queries";

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
}: {
  onHeroSelected: (selectedHero: number | null) => void;
  selectedHero?: number | null;
  allowSelectNull?: boolean;
  label?: string;
}) {
  const { sortedHeroes } = useHeroes();
  const [search, setSearch] = useState("");

  const currentHero = selectedHero ? sortedHeroes.find((h: HeroV2) => h.id === selectedHero) : undefined;

  const filteredHeroes = useMemo(() => {
    if (!search) return sortedHeroes;
    const lower = search.toLowerCase();
    return sortedHeroes.filter((h: HeroV2) => h.name.toLowerCase().includes(lower));
  }, [sortedHeroes, search]);

  const isActive = selectedHero != null;

  const icon = currentHero ? (
    <HeroImage heroId={currentHero.id} className="size-4 shrink-0 object-contain" />
  ) : undefined;

  const displayValue = currentHero ? currentHero.name : "Any";

  return (
    <FilterPill label={label ?? "Hero"} value={displayValue} active={isActive} icon={icon} className="w-52 p-2">
      {currentHero && (
        <div className="mb-1 flex items-center gap-2 px-2 py-1 text-sm font-medium">
          <HeroImage heroId={currentHero.id} className="size-4 shrink-0 object-contain" />
          <HeroName heroId={currentHero.id} />
        </div>
      )}
      <div className="relative mb-2">
        <SearchIcon className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search heroes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 pl-7 text-sm"
        />
      </div>
      <div className="flex max-h-[300px] flex-col overflow-y-auto">
        {allowSelectNull && (
          <button
            type="button"
            className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
            onClick={() => {
              onHeroSelected(null);
              setSearch("");
            }}
          >
            <span className="size-5" />
            <span className="text-muted-foreground">Any Hero</span>
          </button>
        )}
        {filteredHeroes.map((hero: HeroV2) => (
          <button
            key={hero.id}
            type="button"
            className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
            onClick={() => {
              onHeroSelected(hero.id);
              setSearch("");
            }}
          >
            <HeroImage heroId={hero.id} className="size-5 shrink-0 object-contain" />
            <HeroName heroId={hero.id} />
          </button>
        ))}
      </div>
    </FilterPill>
  );
}

export function HeroSelectorMultiple({
  onHeroesSelected,
  selectedHeroes,
  label,
}: {
  onHeroesSelected: (selectedHeroes: number[]) => void;
  selectedHeroes: number[];
  label?: string;
}) {
  const { sortedHeroes, isLoading } = useHeroes();

  if (isLoading) {
    return null;
  }

  return (
    <FilteredSelectPopover
      items={sortedHeroes}
      selectedIds={selectedHeroes}
      onSelectedIdsChange={onHeroesSelected}
      getId={(hero: HeroV2) => hero.id}
      emptyLabel={label ?? "Select Heroes..."}
      renderChip={(heroId) => (
        <>
          <HeroImage heroId={heroId} className="size-4 shrink-0 object-contain" />
          <HeroName heroId={heroId} className="truncate text-xs" />
        </>
      )}
      renderRow={(hero: HeroV2) => (
        <>
          <HeroImage heroId={hero.id} className="size-5 shrink-0 object-contain" />
          <HeroName heroId={hero.id} className="truncate text-sm" />
        </>
      )}
    />
  );
}
