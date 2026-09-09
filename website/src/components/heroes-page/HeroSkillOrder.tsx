import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { AnalyticsApiAbilityOrderStatsRequest } from "deadlock_api_client";
import { useMemo } from "react";

import { AbilityImage } from "~/components/AbilityImage";
import { AbilityName } from "~/components/AbilityName";
import { LoadingLogo } from "~/components/LoadingLogo";
import { type AbilityTrieNode, buildAbilityTrie, getSortedChildren } from "~/lib/ability-order-utils";
import { formatPercent } from "~/lib/format";
import { cn } from "~/lib/utils";
import { abilityOrderQueryOptions } from "~/queries/ability-order-query";
import { abilitiesQueryOptions, heroesQueryOptions } from "~/queries/asset-queries";

const MAX_STEPS = 12;
/** Stop following the path once fewer than this share of the hero's players are still on it. */
const MIN_PATH_SHARE = 0.05;
const HERO_ABILITY_SLOTS = ["signature1", "signature2", "signature3", "signature4"] as const;

const SLOT_CLASSES: Record<number, string> = {
  1: "bg-blue-500/15 text-blue-400",
  2: "bg-green-500/15 text-green-400",
  3: "bg-purple-500/15 text-purple-400",
  4: "bg-orange-500/15 text-orange-400",
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
    return (
      <div className="flex items-center justify-center py-8">
        <LoadingLogo />
      </div>
    );
  }
  if (!path) return null;

  const opener = path.steps.slice(0, 3).map((step) => slotByAbility.get(step.abilityId) ?? "?");

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold tracking-tight">{heroName} Skill Order</h2>
      <p className="text-sm text-muted-foreground">
        The most common {heroName} build opens{" "}
        <span className="font-semibold text-foreground">{opener.join(" → ")}</span> and follows this order for its first{" "}
        {path.steps.length} upgrades.{" "}
        <span className="font-semibold text-foreground">{formatPercent(path.share, 0)}</span> of {heroName} players in
        the current patch level up exactly this way, winning{" "}
        <span className="font-semibold text-foreground">{formatPercent(path.winRate)}</span> of{" "}
        {path.matches.toLocaleString("en-US")} matches. The number under each ability is how many players took it next.
      </p>
      <ol className="flex flex-wrap gap-2">
        {path.steps.map((step) => {
          const slot = slotByAbility.get(step.abilityId);
          return (
            <li
              key={step.level}
              className="flex w-16 flex-col items-center gap-1 rounded-lg border border-border bg-card py-2"
              title={`${step.level}. ${slot ? `Ability ${slot}` : "Ability"}`}
            >
              <span className="text-[10px] font-medium text-muted-foreground tabular-nums">{step.level}</span>
              <AbilityImage abilityId={step.abilityId} className="size-8 rounded-md" />
              <span
                className={cn(
                  "rounded px-1.5 text-[10px] font-semibold tabular-nums",
                  slot ? SLOT_CLASSES[slot] : "bg-muted text-muted-foreground",
                )}
              >
                {slot ?? "?"}
              </span>
              <span className="text-[10px] text-muted-foreground tabular-nums">{formatPercent(step.pickRate, 0)}</span>
              <AbilityName abilityId={step.abilityId} className="sr-only" />
            </li>
          );
        })}
      </ol>
      <Link
        to="/abilities"
        search={{ hero_id: heroId }}
        preload="intent"
        className="inline-block text-sm font-medium text-primary underline underline-offset-4"
      >
        Explore all {heroName} skill orders
      </Link>
    </section>
  );
}
