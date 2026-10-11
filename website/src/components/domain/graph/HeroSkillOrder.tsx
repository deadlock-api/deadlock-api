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
import { useDefaultPeriodLabel } from "~/hooks/useDefaultPeriodLabel";
import { type AbilityTrieNode, buildAbilityTrie, getSortedChildren } from "~/lib/ability-order-utils";
import { formatPercent, possessive } from "~/lib/format";
import { abilityOrderQueryOptions } from "~/queries/ability-order-query";
import { abilitiesQueryOptions, heroesQueryOptions } from "~/queries/asset-queries";

const MAX_STEPS = 12;
/** Stop following the path once fewer than this share of the hero's players are still on it. */
const MIN_PATH_SHARE = 0.05;
const HERO_ABILITY_SLOTS = ["signature1", "signature2", "signature3", "signature4"] as const;

interface Step {
  level: number;
  abilityId: number;
  /** Share of players at the previous step who took this upgrade next. */
  pickRate: number;
}

function mostCommonPath(root: AbilityTrieNode): { steps: Step[]; leaf: AbilityTrieNode } {
  const steps: Step[] = [];
  let node = root;
  while (steps.length < MAX_STEPS) {
    const next = getSortedChildren(node)[0];
    if (!next || next.abilityId == null || next.matches < root.matches * MIN_PATH_SHARE) break;
    steps.push({ level: steps.length + 1, abilityId: next.abilityId, pickRate: next.matches / node.matches });
    node = next;
  }
  return { steps, leaf: node };
}

export function HeroSkillOrder({
  heroId,
  totalMatches,
  heroName,
  request,
  rankRange,
  className,
}: {
  className?: string;
  heroId: number;
  heroName: string;
  request: Omit<AnalyticsApiAbilityOrderStatsRequest, "heroId">;
  /** The request's rank range in words, such as "Phantom 1+". */
  rankRange: string;
  /** The hero's matches over the same filters. The orders only cover sequences played at least `minMatches` times,
   * which leaves out about half the hero's matches (most full sequences are unique), so their own total overstates
   * every share. */
  totalMatches?: number;
}) {
  const period = useDefaultPeriodLabel();
  const orderQuery = useQuery(abilityOrderQueryOptions({ ...request, heroId }));
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

  // The grid's rows need the hero and ability lists too; without them it would wait forever, so a failure of any of
  // the three is the panel's error.
  const failed = [orderQuery, heroesQuery, abilitiesQuery].filter((query) => query.isError && !query.data);
  const opener = path?.steps.slice(0, 3).map((step) => {
    const slot = slotAbilities.indexOf(step.abilityId);
    return slot >= 0 ? slot + 1 : "?";
  });

  return (
    <Panel className={className}>
      <PanelHeader title={`${heroName} Skill Order`} description={`Most common · ${rankRange}`} />
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
            </div>
            <AbilityOrderGrid abilityIds={slotAbilities} steps={path.steps} />
            <p className="text-xs leading-relaxed text-muted-foreground">
              {formatPercent(path.share, 0)} of {rankRange} {heroName} players in {period} take exactly these first{" "}
              {path.steps.length} upgrades, winning {formatPercent(path.winRate)} of{" "}
              {path.matches.toLocaleString("en-US")} matches. The bottom row is how many players at each step took that
              upgrade next.
            </p>
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
