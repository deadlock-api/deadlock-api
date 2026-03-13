import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { HeroSelector } from "~/components/selectors/HeroSelector";
import { heroesQueryOptions } from "~/queries/asset-queries";

import { createFilter } from "./createFilter";

function useHeroName() {
  const { data: heroes } = useQuery(heroesQueryOptions);

  const heroMap = useMemo(() => {
    if (!heroes) return null;
    const map = new Map<number, string>();
    for (const hero of heroes) {
      map.set(hero.id, hero.name);
    }
    return map;
  }, [heroes]);

  return useCallback(
    (heroId: number | null | undefined): string | null => {
      if (heroId == null || !heroMap) return null;
      return heroMap.get(heroId) ?? null;
    },
    [heroMap],
  );
}

export const HeroFilter = createFilter<{
  value: number | null;
  onChange: (heroId: number | null) => void;
  allowNull?: boolean;
  label?: string;
}>({
  useDescription(props) {
    const heroName = useHeroName();
    return { hero: props.value != null ? heroName(props.value) : null };
  },
  Render({ value, onChange, allowNull, label }) {
    return (
      <HeroSelector
        onHeroSelected={(x) => onChange(x ?? null)}
        selectedHero={value ?? undefined}
        allowSelectNull={allowNull}
        label={label}
      />
    );
  },
});
