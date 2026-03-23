import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

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
 * Returns visible hero IDs, the legend click handler,
 * and a pre-built Recharts Legend payload.
 */
export function useChartHeroVisibility(
  heroIdMap: Record<number, { name: string; color: string }>,
  options: {
    heroIdFilter?: number[];
    legendType?: "line" | "circle" | "square";
    showAllByDefault?: boolean;
  } = {},
) {
  const { heroIdFilter, legendType = "line", showAllByDefault = false } = options;
  const allHeroIds = useMemo(() => {
    const ids = heroIdFilter ?? Object.keys(heroIdMap).map(Number);
    return ids.sort((a, b) => (heroIdMap[a]?.name ?? "").localeCompare(heroIdMap[b]?.name ?? ""));
  }, [heroIdMap, heroIdFilter]);

  const [visibleHeroSet, setVisibleHeroSet] = useState<Set<number>>(() => new Set([2]));

  const handleLegendClick = useCallback(
    (entry: { value?: string }) => {
      const heroId = allHeroIds.find((id) => (heroIdMap[id]?.name ?? `Hero ${id}`) === entry.value);
      if (heroId === undefined) return;
      setVisibleHeroSet((prev) => {
        const next = new Set(prev);
        if (next.has(heroId)) {
          next.delete(heroId);
        } else {
          next.add(heroId);
        }
        return next;
      });
    },
    [allHeroIds, heroIdMap],
  );

  const allHeroIdSet = useMemo(() => new Set(allHeroIds), [allHeroIds]);
  const effectiveVisibleSet = showAllByDefault ? allHeroIdSet : visibleHeroSet;

  const visibleHeroIds = useMemo(
    () => allHeroIds.filter((id) => effectiveVisibleSet.has(id)),
    [allHeroIds, effectiveVisibleSet],
  );

  const legendPayload = useMemo(
    () =>
      allHeroIds.map((heroId) => ({
        value: heroIdMap[heroId]?.name ?? `Hero ${heroId}`,
        type: legendType,
        color: effectiveVisibleSet.has(heroId) ? (heroIdMap[heroId]?.color ?? "#ffffff") : "#555555",
      })),
    [allHeroIds, heroIdMap, legendType, effectiveVisibleSet],
  );

  return { visibleHeroIds, handleLegendClick, legendPayload };
}
