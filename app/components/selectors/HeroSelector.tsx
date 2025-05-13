import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import type { AssetsHero } from "~/types/assets_hero";

function getHeroImageUrl(hero: AssetsHero | undefined): string | undefined {
  return hero?.images?.minimap_image_webp;
}

export default function HeroSelector({
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
  const { data, isLoading } = useQuery<AssetsHero[]>({
    queryKey: ["assets-heroes"],
    queryFn: async () => {
      return fetch("https://assets.deadlock-api.com/v2/heroes?only_active=true").then((res) => res.json());
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

  const sortedHeroes = useMemo(
    () => data?.sort((a: AssetsHero, b: AssetsHero) => a.name.localeCompare(b.name)) ?? [],
    [data],
  );

  const handleValueChange = (value: string) => {
    if (value === "none" || value === "") {
      onHeroSelected(null);
    } else {
      onHeroSelected(Number(value));
    }
  };

  const selectValue = selectedHero === null || selectedHero === undefined ? "" : String(selectedHero);

  const currentHero = selectedHero ? sortedHeroes.find((opt: AssetsHero) => opt.id === selectedHero) : undefined;

  return (
    <div className="flex flex-col gap-1.5 w-full max-w-[200px]">
      <div className="flex items-baseline gap-2">
        <span className="text-sm text-foreground">{label || "Hero"}</span>
      </div>
      {isLoading ? (
        <Skeleton className="h-10 w-32" />
      ) : (
        <Select value={selectValue} onValueChange={handleValueChange}>
          <SelectTrigger className="w-full focus-visible:ring-0">
            <SelectValue placeholder={"Select Hero..."}>
              {currentHero ? (
                <div className="flex items-center gap-2">
                  <img
                    src={getHeroImageUrl(currentHero)}
                    alt={currentHero.name}
                    className="size-6 object-contain flex-shrink-0"
                  />
                  <span className="truncate">{currentHero.name}</span>
                </div>
              ) : null}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {allowSelectNull && (
              <SelectItem value="none">
                <span className="truncate">None</span>
              </SelectItem>
            )}
            {sortedHeroes.map((hero: AssetsHero) => (
              <SelectItem key={hero.id} value={String(hero.id)}>
                <img src={getHeroImageUrl(hero)} alt={hero.name} className="size-6 object-contain flex-shrink-0 mr-2" />
                <span className="truncate">{hero.name}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
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
  const { data, isLoading } = useQuery<AssetsHero[]>({
    queryKey: ["assets-heroes"],
    queryFn: () => fetch("https://assets.deadlock-api.com/v2/heroes?only_active=true").then((res) => res.json()),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const sortedHeroes = useMemo(
    () => data?.sort((a: AssetsHero, b: AssetsHero) => a.name.localeCompare(b.name)) ?? [],
    [data],
  );

  if (isLoading) {
    return "";
  }

  const allSelected = selectedHeroes.length === sortedHeroes.length;
  const noneSelected = selectedHeroes.length === 0;
  const indeterminate = !allSelected && !noneSelected;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full max-w-[200px] justify-start">
          <div className="flex flex-wrap gap-2 items-center min-h-5">
            {selectedHeroes.length === 0 ? (
              <span className="truncate text-muted-foreground">{label || "Select Heroes..."}</span>
            ) : (
              sortedHeroes
                .filter((hero: AssetsHero) => selectedHeroes.includes(hero.id))
                .map((hero: AssetsHero) => (
                  <span key={hero.id} className="flex items-center gap-1 bg-muted rounded px-1 py-0.5">
                    <img src={getHeroImageUrl(hero)} alt={hero.name} className="h-4 w-4 object-contain flex-shrink-0" />
                    <span className="truncate text-xs">{hero.name}</span>
                  </span>
                ))
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
                  onHeroesSelected(sortedHeroes.map((hero: AssetsHero) => hero.id));
                } else {
                  onHeroesSelected([]);
                }
              }}
              id="select-all-heroes"
            />
            <label htmlFor="select-all-heroes" className="text-sm cursor-pointer select-none">
              Select all
            </label>
          </div>
          {sortedHeroes.map((hero: AssetsHero) => (
            <div
              key={hero.id}
              className="flex items-center gap-2 px-2 py-1 hover:bg-accent rounded cursor-pointer"
              onClick={() => {
                if (selectedHeroes.includes(hero.id)) {
                  onHeroesSelected(selectedHeroes.filter((id: number) => id !== hero.id));
                } else {
                  onHeroesSelected([...selectedHeroes, hero.id]);
                }
              }}
            >
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
              <img src={getHeroImageUrl(hero)} alt={hero.name} className="h-5 w-5 object-contain flex-shrink-0" />
              <label htmlFor={`hero-checkbox-${hero.id}`} className="truncate text-sm cursor-pointer">
                {hero.name}
              </label>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
