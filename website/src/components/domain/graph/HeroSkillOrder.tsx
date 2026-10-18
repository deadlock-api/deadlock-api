import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { AnalyticsApiAbilityOrderStatsRequest } from "deadlock_api_client";
import { useMemo } from "react";

import { AbilityOrderGrid } from "~/components/domain/assets/AbilityOrderGrid";
import { Panel, PanelBody, PanelFooter, PanelHeader } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { InlineStat } from "~/components/ui/inline-stat";
import { TextLink } from "~/components/ui/text-link";
import { type AbilityTrieNode, avgTimeS, buildAbilityTrie, getSortedChildren } from "~/lib/ability-order-utils";
import { formatPercent, possessive } from "~/lib/format";
import { abilityOrderQueryOptions } from "~/queries/ability-order-query";
import { abilitiesQueryOptions, heroesQueryOptions } from "~/queries/asset-queries";

const MAX_STEPS = 12;
/** Stop following the path once fewer than this share of the hero's players are still on it. */
const MIN_PATH_SHARE = 0.05;
const HERO_ABILITY_SLOTS = ["signature1", "signature2", "signature3", "signature4"] as const;

export interface SkillStep {
  level: number;
  abilityId: number;
  /** Share of players at the previous step who took this upgrade next. */
  pickRate: number;
  /** When the players on this path took it, on average (seconds); null for answers without times. */
  at: number | null;
}

function mostCommonPath(root: AbilityTrieNode): { steps: SkillStep[]; leaf: AbilityTrieNode } {
  const steps: SkillStep[] = [];
  let node = root;
  while (steps.length < MAX_STEPS) {
    const next = getSortedChildren(node)[0];
    if (!next || next.abilityId == null || next.matches < root.matches * MIN_PATH_SHARE) break;
    steps.push({
      level: steps.length + 1,
      abilityId: next.abilityId,
      pickRate: next.matches / node.matches,
      at: avgTimeS(next),
    });
    node = next;
  }
  return { steps, leaf: node };
}

/**
 * A hero's most common skill order from the ability order stats of `request`: the hero's four abilities in slot order,
 * the path's steps (with each upgrade's average time) and its share and win rate, and the three queries behind it.
 */
export function useHeroSkillPath(
  heroId: number,
  request: Omit<AnalyticsApiAbilityOrderStatsRequest, "heroId">,
  totalMatches?: number,
  /** Off while there is no hero to ask about. */
  enabled = true,
  /**
   * Keeps the shown order while another request for the same hero loads (a build's items changed), so its panel does
   * not drop to a shorter loading state and back. Never across heroes: their abilities differ.
   */
  keepWhileLoading = false,
) {
  const orderQuery = useQuery({
    ...abilityOrderQueryOptions({ ...request, heroId }),
    enabled,
    placeholderData: keepWhileLoading
      ? (previous, previousQuery) =>
          (previousQuery?.queryKey[1] as { heroId?: number } | undefined)?.heroId === heroId ? previous : undefined
      : undefined,
  });
  const heroesQuery = useQuery(heroesQueryOptions);
  const abilitiesQuery = useQuery(abilitiesQueryOptions);
  const heroes = heroesQuery.data;
  const abilities = abilitiesQuery.data;

  /** The hero's four abilities in slot order: the rows of the grid. */
  const slotAbilities = useMemo(() => {
    const hero = heroes?.find((h) => h.id === heroId);
    if (!hero || !abilities) return [];
    return HERO_ABILITY_SLOTS.flatMap((slot) => {
      const ability = abilities.find((a) => a.class_name === hero.items?.[slot]);
      return ability ? [ability.id] : [];
    });
  }, [heroes, abilities, heroId]);

  const path = useMemo(() => {
    if (!orderQuery.data || orderQuery.data.length === 0) return null;
    const root = buildAbilityTrie(orderQuery.data);
    const { steps, leaf } = mostCommonPath(root);
    if (steps.length < 4) return null;
    const players = Math.max(root.matches, totalMatches ?? 0);
    return { steps, share: leaf.matches / players, winRate: leaf.wins / leaf.matches, matches: leaf.matches };
  }, [orderQuery.data, totalMatches]);

  return { orderQuery, heroesQuery, abilitiesQuery, slotAbilities, path };
}

export function HeroSkillOrder({
  heroId,
  totalMatches,
  heroName,
  request,
  rankRange,
  scope = "Most common",
  className,
}: {
  className?: string;
  heroId: number;
  heroName: string;
  request: Omit<AnalyticsApiAbilityOrderStatsRequest, "heroId">;
  /** What the order is, before the rank range in the header: "Most common", "Most common with this build". */
  scope?: string;
  /** The request's rank range in words, such as "Phantom 1+". */
  rankRange: string;
  /** The hero's matches over the same filters. The orders only cover sequences played at least `minMatches` times,
   * which leaves out about half the hero's matches (most full sequences are unique), so their own total overstates
   * every share. */
  totalMatches?: number;
}) {
  const { orderQuery, heroesQuery, abilitiesQuery, slotAbilities, path } = useHeroSkillPath(
    heroId,
    request,
    totalMatches,
  );

  // The grid's rows need the hero and ability lists too; without them it would wait forever, so a failure of any of
  // the three is the panel's error.
  const failed = [orderQuery, heroesQuery, abilitiesQuery].filter((query) => query.isError && !query.data);
  const opener = path?.steps.slice(0, 3).map((step) => {
    const slot = slotAbilities.indexOf(step.abilityId);
    return slot >= 0 ? slot + 1 : "?";
  });

  return (
    <Panel className={className}>
      <PanelHeader title={`${heroName} Skill Order`} description={`${scope} · ${rankRange}`} />
      <PanelBody className="flex flex-col gap-4">
        {failed.length > 0 ? (
          <ErrorState
            variant="inline"
            title={`Could not load ${possessive(heroName)} skill order`}
            retrying={failed.some((query) => query.isFetching)}
            onRetry={() => failed.forEach((query) => void query.refetch())}
          />
        ) : [orderQuery, heroesQuery, abilitiesQuery].some((query) => query.isPending) ? (
          <LoadingState label="skill order" variant="skeleton" />
        ) : !path || !opener || slotAbilities.length === 0 ? (
          <EmptyState variant="inline" title={`Too few ${heroName} games share one skill order to show it yet`} />
        ) : (
          <>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <InlineStat value={opener.join(" → ")} label="opener" />
              <InlineStat value={formatPercent(path.winRate)} label="win rate" />
              <InlineStat value={formatPercent(path.share, 0)} label="of players" />
              <InlineStat value={path.matches.toLocaleString("en-US")} label="matches" />
            </div>
            <AbilityOrderGrid abilityIds={slotAbilities} steps={path.steps} />
          </>
        )}
      </PanelBody>
      <PanelFooter>
        <TextLink asChild>
          <Link
            to="/analytics/abilities"
            search={{ hero_id: heroId, min_rank: request.minAverageBadge, max_rank: request.maxAverageBadge }}
            preload="intent"
          >
            Explore all {heroName} skill orders
          </Link>
        </TextLink>
      </PanelFooter>
    </Panel>
  );
}
