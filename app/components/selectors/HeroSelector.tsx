import { useQuery } from "@tanstack/react-query";
import type { HeroV2 } from "assets-deadlock-api-client";
import { useId, useMemo } from "react";
import HeroImage from "~/components/HeroImage";
import HeroName from "~/components/HeroName";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import { assetsApi } from "~/lib/assets-api";

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
  const { data, isLoading } = useQuery({
    queryKey: ["assets-heroes"],
    queryFn: async () => {
      const response = await assetsApi.heroes_api.getHeroesV2HeroesGet({ onlyActive: true });
      return response.data;
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

  const sortedHeroes = useMemo(
    () =>
      data?.filter((h) => h.in_development !== true).sort((a: HeroV2, b: HeroV2) => a.name.localeCompare(b.name)) ?? [],
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

  const currentHero = selectedHero ? sortedHeroes.find((opt: HeroV2) => opt.id === selectedHero) : undefined;

  return (
    <div className="flex flex-col gap-1.5 w-full max-w-[200px]">
      <div className="flex justify-center md:justify-start items-center h-8">
        <span className="text-sm font-semibold text-foreground">{label || "Hero"}</span>
      </div>
      {isLoading ? (
        <Skeleton className="h-10 w-32" />
      ) : (
        <Select value={selectValue} onValueChange={handleValueChange}>
          <SelectTrigger className="w-full focus-visible:ring-0">
            <SelectValue placeholder={"Select Hero..."}>
              {currentHero ? (
                <div className="flex items-center gap-2">
                  <HeroImage heroId={currentHero.id} className="size-4 object-contain shrink-0" />
                  <HeroName heroId={currentHero.id} />
                </div>
              ) : null}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="flex items-center gap-2 w-fit max-h-[70vh] overflow-y-scroll flex-nowrap flex-row">
            {allowSelectNull && (
              <SelectItem value="none">
                <span className="truncate">None</span>
              </SelectItem>
            )}
            {sortedHeroes.map((hero: HeroV2) => (
              <SelectItem key={hero.id} value={String(hero.id)}>
                <div className="flex items-center gap-2 flex-nowrap">
                  <HeroImage heroId={hero.id} className="size-5 object-contain shrink-0" />
                  <HeroName heroId={hero.id} />
                </div>
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
  const { data, isLoading } = useQuery({
    queryKey: ["assets-heroes"],
    queryFn: async () => {
      const response = await assetsApi.heroes_api.getHeroesV2HeroesGet({ onlyActive: true });
      return response.data;
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

  const sortedHeroes = useMemo(
    () =>
      data?.filter((h) => h.in_development !== true).sort((a: HeroV2, b: HeroV2) => a.name.localeCompare(b.name)) ?? [],
    [data],
  );

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
