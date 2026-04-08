import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import type { LegendPayload } from "recharts";

import { heroesQueryOptions } from "~/queries/asset-queries";

/**
 * Builds a map of hero ID → { name, color } from asset data.
 * Shared across all hero chart components.
 */
export function useHeroColorMap() {
  const { data: assetsHeroes, isLoading } = useQuery(heroesQueryOptions);

  const heroIdMap = useMemo(() => {
    const map: Record<number, { name: string; color: string }> = {};
    for (const hero of assetsHeroes || []) {
      const uiColor = hero.colors?.ui;
      map[hero.id] = { name: hero.name, color: uiColor ? `rgb(${uiColor.join(",")})` : "#ffffff" };
    }
    return map;
  }, [assetsHeroes]);

  return { heroIdMap, isLoadingHeroes: isLoading };
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
    showAllByDefault?: boolean;
  } = {},
) {
  const { heroIdFilter, showAllByDefault = false } = options;
  const allHeroIds = useMemo(() => {
    const ids = heroIdFilter ?? Object.keys(heroIdMap).map(Number);
    return ids.sort((a, b) => (heroIdMap[a]?.name ?? "").localeCompare(heroIdMap[b]?.name ?? ""));
  }, [heroIdMap, heroIdFilter]);

  const [visibleHeroSet, setVisibleHeroSet] = useState<Set<number>>(() => new Set([2]));

  const handleLegendClick = useCallback((entry: LegendPayload) => {
    if (entry.dataKey == null || typeof entry.dataKey === "function") return;
    const heroId = Number(entry.dataKey);
    if (Number.isNaN(heroId)) return;
    setVisibleHeroSet((prev) => {
      const next = new Set(prev);
      if (next.has(heroId)) {
        next.delete(heroId);
      } else {
        next.add(heroId);
      }
      return next;
    });
  }, []);

  const allHeroIdSet = useMemo(() => new Set(allHeroIds), [allHeroIds]);
  const effectiveVisibleSet = useMemo(
    () => (showAllByDefault ? allHeroIdSet : visibleHeroSet),
    [showAllByDefault, allHeroIdSet, visibleHeroSet],
  );

  return { allHeroIds, effectiveVisibleSet, handleLegendClick };
}
