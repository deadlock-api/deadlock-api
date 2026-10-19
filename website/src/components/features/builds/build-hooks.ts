import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { buildItemIds, buildItemUsage, type BuildRow } from "~/lib/build-stats";
import type { GaussianStats } from "~/lib/gaussian";
import { abilitiesQueryOptions, heroesQueryOptions, itemUpgradesQueryOptions } from "~/queries/asset-queries";
import { type BuildPurchaseFilters, buildItemPurchasesQueryOptions } from "~/queries/hero-build-stats-query";
import { playerPerformanceCurveQueryOptions } from "~/queries/player-performance-curve-query";

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
    // The last build's purchases stay while the next one's load (marked stale), so the panels keep their height.
    placeholderData: keepPreviousData,
  });
  // While the next build's purchases load, the last build's stay with its own row, so its rates and buy order do not
  // mix with the next build's match count.
  const shown = useAnswerWithRow(query.data, query.isPlaceholderData, row);
  const shownPurchases = shown?.data;
  const shownRow = shown?.row;
  const usage = useMemo(
    () =>
      shownPurchases && shownRow?.meta
        ? buildItemUsage(shownPurchases, shownRow, buildItemIds(shownRow.meta))
        : undefined,
    [shownPurchases, shownRow],
  );
  // A failed request leaves the items without their rates rather than holding skeletons.
  const pending = query.isPending && meta != null && (!active || query.fetchStatus !== "idle");
  return { usage, pending, stale: query.isPlaceholderData, failed: query.isError };
}

/**
 * A per-build answer with the build it was asked for. While the next build's request loads and the last answer stands
 * in for it (`placeholder`), the last build stays with it, so numbers read against the build (its win rate, its match
 * count) are the last build's too, not a mix of two builds. Null without an answer.
 */
export function useAnswerWithRow<T>(
  data: T | undefined,
  placeholder: boolean,
  row: BuildRow,
): { data: T; row: BuildRow } | null {
  const fresh = data !== undefined && !placeholder ? { data, row } : null;
  const [kept, setKept] = useState(fresh);
  if (fresh && (kept?.data !== fresh.data || kept.row !== fresh.row)) setKept(fresh);
  return fresh ?? (placeholder ? kept : null);
}

/**
 * The performance curve request of a hero under the page's filters. `resolution: 0` answers at fixed game times (every
 * three minutes up to fifteen, every five after), any other at that step of percent of the match.
 */
export function performanceCurveParams(heroId: number, filters: BuildPurchaseFilters, resolution: number) {
  return {
    heroIds: String(heroId),
    gameMode: "normal" as const,
    matchMode: filters.matchMode,
    minAverageBadge: filters.minAverageBadge,
    maxAverageBadge: filters.maxAverageBadge,
    minUnixTimestamp: filters.minUnixTimestamp,
    maxUnixTimestamp: filters.maxUnixTimestamp,
    minDurationS: filters.minDurationS,
    maxDurationS: filters.maxDurationS,
    resolution,
  };
}

/** The playstyle metrics the performance curve has a spread for, by metric key, with the curve's field. */
const CURVE_FIELDS = {
  soulsPerMin: "net_worth",
  kills: "kills",
  deaths: "deaths",
  assists: "assists",
  damagePerMin: "player_damage",
  denies: "denies",
  neutralKills: "neutral_kills",
  objectiveDamage: "boss_damage",
} as const;

export interface EndOfMatchDistribution {
  value: GaussianStats;
  reference: GaussianStats;
}

/**
 * The build's and the hero's mean and spread of each curve metric at the end of the match (the last tenth of it), by
 * playstyle metric key: what a distribution in a tooltip is drawn from.
 */
export function useEndOfMatchDistributions({
  heroId,
  buildId,
  filters,
  active,
}: {
  heroId: number;
  buildId: number;
  filters: BuildPurchaseFilters;
  active: boolean;
}): Partial<Record<keyof typeof CURVE_FIELDS, EndOfMatchDistribution>> {
  const params = performanceCurveParams(heroId, filters, 10);
  const buildQuery = useQuery({
    ...playerPerformanceCurveQueryOptions({ ...params, heroBuildId: buildId }),
    enabled: active,
  });
  const heroQuery = useQuery({ ...playerPerformanceCurveQueryOptions(params), enabled: active });
  const last = <T extends { game_time: number }>(points: readonly T[] | undefined) =>
    points?.reduce<T | undefined>(
      (latest, point) => (!latest || point.game_time > latest.game_time ? point : latest),
      undefined,
    );
  const build = last(buildQuery.data) as Record<string, number | null | undefined> | undefined;
  const hero = last(heroQuery.data) as Record<string, number | null | undefined> | undefined;
  if (!build || !hero) return {};
  return Object.fromEntries(
    Object.entries(CURVE_FIELDS).map(([key, field]) => [
      key,
      {
        value: { avg: build[`${field}_avg`], std: build[`${field}_std`] },
        reference: { avg: hero[`${field}_avg`], std: hero[`${field}_std`] },
      },
    ]),
  );
}

/** Every item's shop category and price, by id, for `buildSlotCost`; empty until the items load. */
export function useItemPrices(): ReadonlyMap<number, { slot: string; cost: number }> {
  const { data } = useQuery(itemUpgradesQueryOptions);
  return useMemo(
    () => new Map((data ?? []).map((item) => [item.id, { slot: item.item_slot_type, cost: item.cost ?? 0 }])),
    [data],
  );
}
