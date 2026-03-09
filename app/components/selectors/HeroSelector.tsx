import { useQuery } from "@tanstack/react-query";
import type { HeroV2 } from "assets_deadlock_api_client";
import { SearchIcon } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { FilterPill } from "~/components/FilterPill";
import { HeroImage } from "~/components/HeroImage";
import { HeroName } from "~/components/HeroName";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { heroesQueryOptions } from "~/queries/asset-queries";

function useHeroes() {
  const { data, isLoading } = useQuery(heroesQueryOptions);

  const sortedHeroes = useMemo(
    () =>
      data?.filter((h) => h.in_development !== true).sort((a: HeroV2, b: HeroV2) => a.name.localeCompare(b.name)) ?? [],
    [data],
  );

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
    <HeroImage heroId={currentHero.id} className="size-4 object-contain shrink-0" />
  ) : undefined;

  const displayValue = currentHero ? currentHero.name : "Any";

  return (
    <FilterPill label={label ?? "Hero"} value={displayValue} active={isActive} icon={icon} className="w-52 p-2">
      {currentHero && (
        <div className="flex items-center gap-2 px-2 py-1 mb-1 text-sm font-medium">
          <HeroImage heroId={currentHero.id} className="size-4 object-contain shrink-0" />
          <HeroName heroId={currentHero.id} />
        </div>
      )}
      <div className="relative mb-2">
        <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <Input
          placeholder="Search heroes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 pl-7 text-sm"
        />
      </div>
      <div className="max-h-[300px] overflow-y-auto flex flex-col">
        {allowSelectNull && (
          <button
            type="button"
            className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-accent cursor-pointer"
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
            className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-accent cursor-pointer"
            onClick={() => {
              onHeroSelected(hero.id);
              setSearch("");
            }}
          >
            <HeroImage heroId={hero.id} className="size-5 object-contain shrink-0" />
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
  const selectAllId = useId();

  if (isLoading) {
    return "";
  }

  const allSelected = selectedHeroes.length === sortedHeroes.length;
  const noneSelected = selectedHeroes.length === 0;
  const indeterminate = !allSelected && !noneSelected;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-fit min-w-[150px] max-w-[250px] overflow-hidden max-h-20 min-h-9 h-min p-1 box-border"
        >
          <div className="flex flex-wrap gap-2 items-center justify-start">
            {selectedHeroes.length === 0 ? (
              <span className="truncate text-muted-foreground">{label || "Select Heroes..."}</span>
            ) : (
              selectedHeroes
                .map((heroId) => (
                  <span key={heroId} className="flex items-center justify-around gap-1 bg-muted rounded px-1 p-0.5">
                    <HeroImage heroId={heroId} className="size-4 object-contain shrink-0" />
                    <HeroName heroId={heroId} className="truncate text-xs" />
                  </span>
                ))
                .slice(0, 5)
            )}
            {selectedHeroes.length > 5 && (
              <span className="truncate text-muted-foreground">+{selectedHeroes.length - 5}</span>
            )}
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] max-h-[400px] overflow-y-auto p-2">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 px-2 py-1 border-b mb-1">
            <Checkbox
              checked={allSelected ? true : indeterminate ? "indeterminate" : false}
              onCheckedChange={(checked) => {
                if (checked) {
                  onHeroesSelected(sortedHeroes.map((hero: HeroV2) => hero.id));
                } else {
                  onHeroesSelected([]);
                }
              }}
              id={selectAllId}
            />
            <label htmlFor={selectAllId} className="text-sm cursor-pointer select-none">
              Select all
            </label>
          </div>
          {sortedHeroes.map((hero: HeroV2) => (
            <div key={hero.id} className="flex items-center gap-2 px-2 py-1 hover:bg-accent cursor-pointer">
              <Checkbox
                checked={selectedHeroes.includes(hero.id)}
                tabIndex={-1}
                className="mr-2"
                onCheckedChange={() => {
                  if (selectedHeroes.includes(hero.id)) {
                    onHeroesSelected(selectedHeroes.filter((id: number) => id !== hero.id));
                  } else {
                    onHeroesSelected([...selectedHeroes, hero.id]);
                  }
                }}
                id={`hero-checkbox-${hero.id}`}
              />
              <label
                htmlFor={`hero-checkbox-${hero.id}`}
                className="flex flex-nowrap items-center gap-2 w-full truncate text-sm cursor-pointer"
              >
                <HeroImage heroId={hero.id} className="size-5 object-contain shrink-0" />
                <HeroName heroId={hero.id} className="truncate text-sm" />
              </label>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
