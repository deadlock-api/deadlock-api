import { parseAsArrayOf, parseAsInteger, useQueryState } from "nuqs";
import { useMemo } from "react";

import { CHART_HEROES_QUERY_KEY, useChartHeroVisibility } from "~/hooks/useChartHeroVisibility";

/**
 * The heroes a hero chart shows, kept in the URL (`trend_heroes`) so over-time, by-duration and by-rank share them:
 * `heroIdsWithData` are the heroes the chart can draw, `selectedIds` those it does (sorted by name), `pickerHeroes` the
 * whole roster for the `ChartHeroSelector`.
 */
export function useHeroChartSelection(
  heroIdMap: Record<number, { name: string; color: string }>,
  heroIdsWithData: number[],
) {
  const [selectedHeroIds, setSelectedHeroIds] = useQueryState(CHART_HEROES_QUERY_KEY, parseAsArrayOf(parseAsInteger));
  const { allHeroIds, effectiveVisibleSet, setVisibleHeroes } = useChartHeroVisibility(heroIdMap, {
    heroIdFilter: heroIdsWithData,
    value: selectedHeroIds,
    onValueChange: (ids) => void setSelectedHeroIds(ids),
  });
  const selectedIds = useMemo(
    () => allHeroIds.filter((id) => effectiveVisibleSet.has(id)),
    [allHeroIds, effectiveVisibleSet],
  );
  const pickerHeroes = useMemo(
    () =>
      Object.entries(heroIdMap)
        .map(([id, hero]) => ({ id: Number(id), name: hero.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [heroIdMap],
  );
  return { allHeroIds, effectiveVisibleSet, selectedIds, pickerHeroes, setVisibleHeroes };
}
