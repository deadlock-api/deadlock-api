import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { buildItemIds, buildItemUsage, type BuildRow } from "~/lib/build-stats";
import { abilitiesQueryOptions, heroesQueryOptions } from "~/queries/asset-queries";
import { type BuildPurchaseFilters, buildItemPurchasesQueryOptions } from "~/queries/hero-build-stats-query";

const HERO_ABILITY_SLOTS = ["signature1", "signature2", "signature3", "signature4"] as const;

/** The hero's four abilities in slot order: the rows of a skill order grid. */
export function useSlotAbilities(heroId: number): number[] {
  const { data: hero } = useQuery({
    ...heroesQueryOptions,
    select: (heroes) => heroes.find((candidate) => candidate.id === heroId),
  });
  const { data: abilities } = useQuery(abilitiesQueryOptions);
  if (!hero || !abilities) return [];
  return HERO_ABILITY_SLOTS.flatMap((slot) => {
    const ability = abilities.find((candidate) => candidate.class_name === hero.items?.[slot]);
    return ability ? [ability.id] : [];
  });
}

/** The build's skill order with the ability ids the hero no longer has (reworked since it was saved) left out. */
export function useSkillOrder(heroId: number, row: BuildRow): { slotAbilities: number[]; skillOrder: number[] } {
  const slotAbilities = useSlotAbilities(heroId);
  const skillOrder = row.meta?.abilityOrder.filter((abilityId) => slotAbilities.includes(abilityId)) ?? [];
  return { slotAbilities, skillOrder };
}

/**
 * What the build's players bought, from the item stats for the build. `active` false holds the request back (the
 * selection is still moving); `pending` stays true meanwhile, so the views keep their loading states.
 */
export function useBuildItemUsage({
  heroId,
  row,
  filters,
  active,
}: {
  heroId: number;
  row: BuildRow;
  filters: BuildPurchaseFilters;
  active: boolean;
}) {
  const { meta } = row;
  const query = useQuery({
    ...buildItemPurchasesQueryOptions(row.hero_build_id, filters, heroId),
    enabled: meta != null && active,
  });
  const purchases = query.data;
  const usage = useMemo(
    () => (purchases && meta ? buildItemUsage(purchases, row.matches, buildItemIds(meta)) : undefined),
    [purchases, meta, row.matches],
  );
  // A failed request leaves the items without their rates rather than holding skeletons.
  const pending = query.isPending && meta != null && (!active || query.fetchStatus !== "idle");
  return { usage, pending, failed: query.isError };
}
