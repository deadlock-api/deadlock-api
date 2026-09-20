import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import type { LegendPayload } from "recharts";

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

/**
 * Manages hero visibility toggling for chart legends.
 * Returns the full hero list, the visible-set, and a Recharts legend click handler.
 *
 * Recharts v3 ignores any explicit `payload` prop on <Legend> and instead derives
 * the legend from the rendered <Line> components in the chart. To make every hero
 * appear in the legend (even when hidden), render a <Line> for every id in
 * `allHeroIds` and toggle its `hide` prop based on `effectiveVisibleSet`.
 */
export function useChartHeroVisibility(
  heroIdMap: Record<number, { name: string; color: string }>,
  options: {
    heroIdFilter?: number[];
    visibleHeroIds?: number[] | null;
    onVisibleHeroesChange?: (ids: number[]) => void;
  } = {},
) {
  const { heroIdFilter, visibleHeroIds, onVisibleHeroesChange } = options;
  const allHeroIds = useMemo(() => {
    const ids = heroIdFilter ? [...heroIdFilter] : Object.keys(heroIdMap).map(Number);
    return ids.sort((a, b) => (heroIdMap[a]?.name ?? "").localeCompare(heroIdMap[b]?.name ?? ""));
  }, [heroIdMap, heroIdFilter]);

  // Resolve the default after assets/data arrive. A roster without hero 2 still needs a visible line.
  const defaultHeroSet = useMemo(() => new Set(allHeroIds.includes(2) ? [2] : allHeroIds.slice(0, 1)), [allHeroIds]);
  const [visibleHeroSet, setVisibleHeroSet] = useState<Set<number> | null>(null);
  const effectiveVisibleSet = useMemo(
    () =>
      onVisibleHeroesChange
        ? visibleHeroIds == null
          ? defaultHeroSet
          : new Set(visibleHeroIds)
        : (visibleHeroSet ?? defaultHeroSet),
    [onVisibleHeroesChange, visibleHeroIds, visibleHeroSet, defaultHeroSet],
  );
  const setVisibleHeroes = useCallback(
    (ids: number[]) => {
      if (onVisibleHeroesChange) onVisibleHeroesChange(ids);
      else setVisibleHeroSet(new Set(ids));
    },
    [onVisibleHeroesChange],
  );

  const handleLegendClick = useCallback(
    (entry: LegendPayload) => {
      if (entry.dataKey == null || typeof entry.dataKey === "function") return;
      const heroId = Number(entry.dataKey);
      if (Number.isNaN(heroId)) return;
      if (onVisibleHeroesChange) {
        const next = new Set(effectiveVisibleSet);
        if (next.has(heroId)) next.delete(heroId);
        else next.add(heroId);
        onVisibleHeroesChange([...next]);
        return;
      }
      setVisibleHeroSet((prev) => {
        const next = new Set(prev ?? defaultHeroSet);
        if (next.has(heroId)) {
          next.delete(heroId);
        } else {
          next.add(heroId);
        }
        return next;
      });
    },
    [defaultHeroSet, effectiveVisibleSet, onVisibleHeroesChange],
  );

  return { allHeroIds, effectiveVisibleSet, handleLegendClick, setVisibleHeroes };
}
