import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import { resolveVisibleHeroIds } from "~/lib/hero-trends";
import { heroesQueryOptions } from "~/queries/asset-queries";

/**
 * Builds a map of hero ID → { name, color } from asset data.
 * Shared across all hero chart components.
 */
export function useHeroColorMap() {
  const { data: assetsHeroes, isLoading, isError, refetch, isFetching } = useQuery(heroesQueryOptions);

  const heroIdMap = useMemo(() => {
    const map: Record<number, { name: string; color: string }> = {};
    for (const hero of assetsHeroes || []) {
      const uiColor = hero.colors?.style ?? hero.colors?.ui;
      map[hero.id] = { name: hero.name, color: uiColor ? `rgb(${uiColor.join(",")})` : "var(--foreground)" };
    }
    return map;
  }, [assetsHeroes]);

  return {
    heroIdMap,
    isLoadingHeroes: isLoading,
    isErrorHeroes: isError,
    refetchHeroes: refetch,
    isFetchingHeroes: isFetching,
  };
}

/** URL key for the heroes chosen in the hero charts, shared by over-time, by-duration and by-rank. */
export const CHART_HEROES_QUERY_KEY = "trend_heroes";

/**
 * Manages which heroes a chart shows. Controlled with `value` + `onValueChange` (e.g. from the URL,
 * where `null` means "nothing chosen, use the default"), uncontrolled with an optional `defaultValue`.
 * `onValueChange` fires in both modes. Returns the full hero list sorted by name, the visible set and
 * a setter for the chart's hero picker.
 */
export function useChartHeroVisibility(
  heroIdMap: Record<number, { name: string; color: string }>,
  options: {
    heroIdFilter?: number[];
    value?: number[] | null;
    defaultValue?: number[] | null;
    onValueChange?: (ids: number[]) => void;
  } = {},
) {
  const { heroIdFilter, value, defaultValue = null, onValueChange } = options;
  const allHeroIds = useMemo(() => {
    const ids = heroIdFilter ? [...heroIdFilter] : Object.keys(heroIdMap).map(Number);
    return ids.sort((a, b) => (heroIdMap[a]?.name ?? "").localeCompare(heroIdMap[b]?.name ?? ""));
  }, [heroIdMap, heroIdFilter]);

  const isControlled = value !== undefined;
  const [uncontrolledValue, setUncontrolledValue] = useState<number[] | null>(defaultValue);
  const requested = isControlled ? value : uncontrolledValue;
  // Resolved after assets/data arrive, so the default and the unknown-id filter see the real roster.
  const effectiveVisibleSet = useMemo(
    () => new Set(resolveVisibleHeroIds(allHeroIds, requested)),
    [allHeroIds, requested],
  );
  const setVisibleHeroes = useCallback(
    (ids: number[]) => {
      if (!isControlled) setUncontrolledValue(ids);
      onValueChange?.(ids);
    },
    [isControlled, onValueChange],
  );

  return { allHeroIds, effectiveVisibleSet, setVisibleHeroes };
}
