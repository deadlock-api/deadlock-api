import { Checkbox, FormControl, InputLabel, MenuItem, Select } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
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
    queryFn: () => fetch("https://assets.deadlock-api.com/v2/heroes?only_active=true").then((res) => res.json()),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const sortedHeroes = useMemo(() => data?.sort((a, b) => a.name.localeCompare(b.name)) ?? [], [data]);

  if (isLoading) {
    return "";
  }

  return (
    <FormControl size="medium" variant="outlined" sx={{ minWidth: 170, maxWidth: 200 }}>
      <InputLabel id="hero-selector-label" sx={{ color: "white" }}>
        {label || "Select Hero"}
      </InputLabel>
      <Select
        labelId="hero-selector-label"
        id="hero-selector"
        value={selectedHero ?? ""}
        label={label || "Select Hero"}
        onChange={(event) => onHeroSelected(event.target.value)}
        renderValue={(selected) => {
          const hero = sortedHeroes.find((opt) => opt.id === selected);
          if (!hero) {
            return <span className="truncate">Select Hero...</span>;
          }
          return (
            <div className="flex items-center gap-2">
              <img src={getHeroImageUrl(hero)} alt={hero.name} className="h-5 w-5 object-contain flex-shrink-0" />
              <span className="truncate">{hero.name}</span>
            </div>
          );
        }}
        sx={{
          backgroundColor: "#1e293b",
          color: "#f1f5f9",
          borderRadius: 1,
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "#475569",
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "#334155",
          },
          "& .MuiSelect-icon": {
            color: "white",
          },
        }}
        MenuProps={{
          slotProps: {
            paper: {
              sx: {
                maxHeight: 400,
                bgcolor: "#0f172a",
                color: "#cbd5e1",
              },
            },
          },
        }}
      >
        {allowSelectNull && (
          <MenuItem key={0} value="">
            <span className="truncate">None</span>
          </MenuItem>
        )}
        {sortedHeroes.map((hero) => (
          <MenuItem key={hero.id} value={hero.id}>
            <img src={getHeroImageUrl(hero)} alt={hero.name} className="h-5 w-5 object-contain flex-shrink-0 mr-2" />
            <span className="truncate">{hero.name}</span>
          </MenuItem>
        ))}
      </Select>
    </FormControl>
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

  const sortedHeroes = useMemo(() => data?.sort((a, b) => a.name.localeCompare(b.name)) ?? [], [data]);

  if (isLoading) {
    return "";
  }

  return (
    <FormControl size="medium" variant="outlined" sx={{ minWidth: 170, maxWidth: 200 }}>
      <InputLabel id="hero-selector-label" sx={{ color: "white" }}>
        {label || "Select Heroes"}
      </InputLabel>
      <Select
        labelId="hero-selector-label"
        id="hero-selector"
        value={selectedHeroes}
        label={label || "Select Heroes"}
        onChange={(event) => onHeroesSelected(event.target.value as number[])}
        multiple
        renderValue={(selected) => {
          const heroes = selected.map((id) => sortedHeroes.find((hero) => hero.id === id)).filter(Boolean);
          if (!heroes.length) {
            return <span className="truncate">Select Heroes...</span>;
          }
          return (
            <div className="flex flex-wrap gap-2">
              {heroes.map((hero) => (
                <div key={hero?.id} className="flex items-center gap-2">
                  <img src={getHeroImageUrl(hero)} alt={hero?.name} className="h-5 w-5 object-contain flex-shrink-0" />
                  <span className="truncate">{hero?.name}</span>
                </div>
              ))}
            </div>
          );
        }}
        sx={{
          backgroundColor: "#1e293b",
          color: "#f1f5f9",
          borderRadius: 1,
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "#475569",
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "#334155",
          },
          "& .MuiSelect-icon": {
            color: "white",
          },
        }}
        MenuProps={{
          slotProps: {
            paper: {
              sx: {
                maxHeight: 400,
                bgcolor: "#0f172a",
                color: "#cbd5e1",
              },
            },
          },
        }}
      >
        {sortedHeroes.map((hero) => (
          <MenuItem key={hero.id} value={hero.id}>
            <Checkbox checked={selectedHeroes.includes(hero.id)} sx={{ color: "white" }} />
            <img src={getHeroImageUrl(hero)} alt={hero.name} className="h-5 w-5 object-contain flex-shrink-0 mr-2" />
            <span className="truncate">{hero.name}</span>
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
