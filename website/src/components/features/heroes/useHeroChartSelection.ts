import { useQuery } from "@tanstack/react-query";
import { parseAsArrayOf, parseAsInteger, useQueryState } from "nuqs";
import { useMemo } from "react";

import { CHART_HEROES_QUERY_KEY, useChartHeroVisibility } from "~/hooks/useChartHeroVisibility";
import { playableHeroesQueryOptions } from "~/queries/asset-queries";

/**
 * The heroes a hero chart shows, kept in the URL (`trend_heroes`) so over-time, by-duration and by-rank share them:
 * `heroIdsWithData` are the heroes the chart can draw, `selectedIds` those it does (sorted by name), `pickerHeroes` the
 * released roster for the `ChartHeroSelector`. Prototype, disabled and pre-release heroes in the assets are left out.
 */
export function useHeroChartSelection(
  heroIdMap: Record<number, { name: string; color: string }>,
  heroIdsWithData: number[],
) {
  const [selectedHeroIds, setSelectedHeroIds] = useQueryState(CHART_HEROES_QUERY_KEY, parseAsArrayOf(parseAsInteger));
  const { data: releasedHeroes } = useQuery(playableHeroesQueryOptions);
  const releasedIds = useMemo(() => new Set(releasedHeroes?.map((hero) => hero.id)), [releasedHeroes]);
  const releasedIdsWithData = useMemo(
    () => heroIdsWithData.filter((id) => releasedIds.has(id)),
    [heroIdsWithData, releasedIds],
  );
  const { allHeroIds, effectiveVisibleSet, setVisibleHeroes } = useChartHeroVisibility(heroIdMap, {
    heroIdFilter: releasedIdsWithData,
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
        .filter((hero) => releasedIds.has(hero.id))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [heroIdMap, releasedIds],
  );
  return { allHeroIds, effectiveVisibleSet, selectedIds, pickerHeroes, setVisibleHeroes };
}
