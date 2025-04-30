import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { AssetsHero } from "~/types/assets_hero";

export default function HeroSelector({
  onHeroSelected,
  selectedHero,
}: { onHeroSelected: (selectedHeroId: number) => void; selectedHero?: number | null }) {
  const { data } = useQuery<AssetsHero[]>({
    queryKey: ["assets-heroes"],
    queryFn: () => fetch("https://assets.deadlock-api.com/v2/heroes?only_active=true").then((res) => res.json()),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const heroesSorted = useMemo(() => data?.sort((a, b) => a.name.localeCompare(b.name)) ?? [], [data]);

  return (
    <div className="max-w-60">
      <label htmlFor="hero-select" className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">
        Select Hero
      </label>
      <select
        id="hero-select"
        onChange={(e) => onHeroSelected(Number(e.target.value))}
        className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
        value={selectedHero || ""}
      >
        {heroesSorted?.map((hero) => (
          <option key={hero.id} value={hero.id}>
            {hero.name}
          </option>
        ))}
      </select>
    </div>
  );
}
