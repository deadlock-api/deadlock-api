import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { AnalyticsApiAbilityOrderStatsRequest } from "deadlock_api_client";
import { useMemo } from "react";

import { AbilityImage } from "~/components/domain/assets/AbilityImage";
import { AbilityName } from "~/components/domain/assets/AbilityName";
import { Section } from "~/components/patterns/page/Section";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { type AbilityTrieNode, buildAbilityTrie, getSortedChildren } from "~/lib/ability-order-utils";
import { formatPercent } from "~/lib/format";
import { abilityOrderQueryOptions } from "~/queries/ability-order-query";
import { abilitiesQueryOptions, heroesQueryOptions } from "~/queries/asset-queries";

const MAX_STEPS = 12;
/** Stop following the path once fewer than this share of the hero's players are still on it. */
const MIN_PATH_SHARE = 0.05;
const HERO_ABILITY_SLOTS = ["signature1", "signature2", "signature3", "signature4"] as const;

const SLOT_VARIANTS: Record<number, "chart-4" | "chart-2" | "chart-6" | "chart-5"> = {
  1: "chart-4",
  2: "chart-2",
  3: "chart-6",
  4: "chart-5",
};

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
  heroName,
  request,
}: {
  heroId: number;
  heroName: string;
  request: Omit<AnalyticsApiAbilityOrderStatsRequest, "heroId">;
}) {
  const orderQuery = useQuery(abilityOrderQueryOptions({ ...request, heroId }));
  const { data: heroes } = useQuery(heroesQueryOptions);
  const { data: abilities } = useQuery(abilitiesQueryOptions);

  const slotByAbility = useMemo(() => {
    const hero = heroes?.find((h) => h.id === heroId);
    const map = new Map<number, number>();
    if (!hero || !abilities) return map;
    HERO_ABILITY_SLOTS.forEach((slot, i) => {
      const ability = abilities.find((a) => a.class_name === hero.items?.[slot]);
      if (ability) map.set(ability.id, i + 1);
    });
    return map;
  }, [heroes, abilities, heroId]);

  const path = useMemo(() => {
    if (!orderQuery.data || orderQuery.data.length === 0) return null;
    const root = buildAbilityTrie(orderQuery.data);
    const { steps, leaf } = mostCommonPath(root);
    if (steps.length < 4) return null;
    return { steps, share: leaf.matches / root.matches, winRate: leaf.wins / leaf.matches, matches: leaf.matches };
  }, [orderQuery.data]);

  if (orderQuery.isPending) {
    return <LoadingState label="skill order" align="center" className="py-8" />;
  }
  if (!path) return null;

  const opener = path.steps.slice(0, 3).map((step) => slotByAbility.get(step.abilityId) ?? "?");

  return (
    <Section
      title={`${heroName} Skill Order`}
      description={
        <>
          The most common {heroName} build opens{" "}
          <span className="font-semibold text-foreground">{opener.join(" → ")}</span> and follows this order for its
          first {path.steps.length} upgrades.{" "}
          <span className="font-semibold text-foreground">{formatPercent(path.share, 0)}</span> of {heroName} players in
          the current patch level up exactly this way, winning{" "}
          <span className="font-semibold text-foreground">{formatPercent(path.winRate)}</span> of{" "}
          {path.matches.toLocaleString("en-US")} matches. The number under each ability is how many players took it
          next.
        </>
      }
    >
      <ol className="flex flex-wrap gap-2">
        {path.steps.map((step) => {
          const slot = slotByAbility.get(step.abilityId);
          return (
            <li key={step.level} title={`${step.level}. ${slot ? `Ability ${slot}` : "Ability"}`}>
              <Card size="xs" className="w-16 items-center gap-1">
                <span className="text-3xs font-medium text-muted-foreground tabular-nums">{step.level}</span>
                <AbilityImage abilityId={step.abilityId} className="size-8" />
                <Badge
                  variant={(slot && SLOT_VARIANTS[slot]) || "muted"}
                  size="sm"
                  shape="square"
                  className="font-semibold"
                >
                  {slot ?? "?"}
                </Badge>
                <span className="text-3xs text-muted-foreground tabular-nums">{formatPercent(step.pickRate, 0)}</span>
                <AbilityName abilityId={step.abilityId} className="sr-only" />
              </Card>
            </li>
          );
        })}
      </ol>
      <Button asChild variant="link" size="inline" className="self-start">
        <Link to="/analytics/abilities" search={{ hero_id: heroId }} preload="intent">
          Explore all {heroName} skill orders
        </Link>
      </Button>
    </Section>
  );
}
