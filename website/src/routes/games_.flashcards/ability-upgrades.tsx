import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { Ability } from "deadlock_api_client";
import { Fragment, useMemo, useState } from "react";

import { AbilityImage } from "~/components/domain/assets/AbilityImage";
import { HeroSelector } from "~/components/domain/selectors/HeroSelector";
import { FlashcardPage } from "~/components/features/flashcards/FlashcardChrome";
import {
  FlashcardBoard,
  FlashcardOptions,
  FlashcardPrompt,
  useFlashcardEntry,
} from "~/components/features/flashcards/FlashcardGame";
import { useFlashcardDeck } from "~/components/features/flashcards/use-flashcard-deck";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Stack } from "~/components/ui/stack";
import { Text } from "~/components/ui/text";
import { useHydrated } from "~/hooks/useHydrated";
import {
  UPGRADE_TIER_COST,
  UPGRADE_TIERS,
  type UpgradeLine,
  type UpgradeTier,
  upgradeLines,
} from "~/lib/ability-upgrade-text";
import { pageTitle, seo } from "~/lib/seo";
import { abilitiesFullQueryOptions, playableHeroesQueryOptions, type SlimHero } from "~/queries/asset-queries";

const SIGNATURE_SLOTS = ["signature1", "signature2", "signature3", "signature4"] as const;

interface UpgradeEntry {
  id: number;
  hero: SlimHero;
  ability: Ability;
  tier: UpgradeTier;
  lines: UpgradeLine[];
}

export const Route = createFileRoute("/games_/flashcards/ability-upgrades")({
  component: AbilityUpgradeFlashcards,
  head: () =>
    seo({
      title: pageTitle("Ability Upgrade Flashcards - Learn T1, T2, T3"),
      description:
        "Learn every Deadlock hero's ability upgrades. Match each upgrade to its tier: 1, 2 or 5 ability points.",
      path: "/games/flashcards/ability-upgrades",
    }),
});

/** A card per upgrade of each playable hero's four abilities, in hero and slot order. */
function buildUpgradePool(heroes: SlimHero[], abilities: Ability[]): UpgradeEntry[] {
  const abilityByClassName = new Map(abilities.map((ability) => [ability.class_name, ability]));
  const entries = new Map<number, UpgradeEntry>();
  for (const hero of heroes) {
    for (const slot of SIGNATURE_SLOTS) {
      const ability = abilityByClassName.get(hero.items?.[slot] ?? "");
      if (!ability || ability.upgrades?.length !== UPGRADE_TIERS.length) continue;
      for (const tier of UPGRADE_TIERS) {
        const lines = upgradeLines(ability, tier);
        // Ability ids are 32-bit; times four leaves room for the tier and stays a safe integer.
        const id = ability.id * 4 + tier;
        if (lines.length > 0 && !entries.has(id)) entries.set(id, { id, hero, ability, tier, lines });
      }
    }
  }
  return [...entries.values()];
}

function pickCard(pool: UpgradeEntry[], excludeIds: Set<number>, random: () => number) {
  const answerPool = pool.filter((entry) => !excludeIds.has(entry.id));
  if (answerPool.length === 0) return null;
  const answer = answerPool[Math.floor(random() * answerPool.length)];
  // The tiers in their order, so the number keys 1 to 3 pick the tier of that number.
  return { answer, options: [...UPGRADE_TIERS] };
}

const TITLE = "Ability Upgrades";
const SUBTITLE = "Match each ability upgrade to its tier.";

function AbilityUpgradeFlashcards() {
  const heroes = useQuery(playableHeroesQueryOptions);
  const abilities = useQuery(abilitiesFullQueryOptions);
  // The first card is drawn at random, so the server and client would disagree on it.
  const hydrated = useHydrated();

  const pool = useMemo(
    () => (heroes.data && abilities.data ? buildUpgradePool(heroes.data, abilities.data) : []),
    [heroes.data, abilities.data],
  );

  if (heroes.isLoading || abilities.isLoading || !hydrated) {
    return (
      <FlashcardPage title={TITLE} subtitle={SUBTITLE}>
        <LoadingState label="flashcards" />
      </FlashcardPage>
    );
  }

  // A failed load would otherwise read as an empty deck.
  if ((heroes.isError && !heroes.data) || (abilities.isError && !abilities.data)) {
    return (
      <FlashcardPage title={TITLE} subtitle={SUBTITLE}>
        <ErrorState
          title="Could not load the cards"
          onRetry={() => {
            void heroes.refetch();
            void abilities.refetch();
          }}
          retrying={heroes.isFetching || abilities.isFetching}
        />
      </FlashcardPage>
    );
  }

  return <AbilityUpgradeFlashcardsReady pool={pool} />;
}

const optionKey = (tier: UpgradeTier) => tier;
const optionName = (tier: UpgradeTier) => `Tier ${tier}`;
const answerKey = (answer: UpgradeEntry) => answer.tier;
const answerName = (answer: UpgradeEntry) => `Tier ${answer.tier}`;

function AbilityUpgradeFlashcardsReady({ pool }: { pool: UpgradeEntry[] }) {
  const [heroId, setHeroId] = useState<number | null>(null);
  const heroPool = useMemo(
    () => (heroId === null ? pool : pool.filter((entry) => entry.hero.id === heroId)),
    [pool, heroId],
  );

  const deck = useFlashcardDeck({
    pool: heroPool,
    deck: "ability-upgrades",
    draw: pickCard,
    optionKey,
    optionName,
    answerKey,
    answerName,
    reshuffleKey: String(heroId ?? "all"),
  });

  return (
    <FlashcardBoard
      deck={deck}
      title={TITLE}
      subtitle={SUBTITLE}
      total={heroPool.length}
      controls={<HeroSelector size="sm" allowNull value={heroId} onValueChange={setHeroId} />}
      masteredLabel="All ability upgrades mastered"
      emptyTitle="No ability upgrades found."
    >
      <FlashcardPrompt size="wide">
        <UpgradePrompt />
      </FlashcardPrompt>
      <FlashcardOptions columns={3}>
        <TierOption />
      </FlashcardOptions>
    </FlashcardBoard>
  );
}

/** The prompt: the hero's ability and what one of its upgrades does. */
function UpgradePrompt() {
  const { hero, ability, lines } = useFlashcardEntry<UpgradeEntry>();
  return (
    <Stack gap={3} className="p-5">
      {/* The end padding keeps the name clear of the verdict mark in the corner. */}
      <div className="flex items-center gap-3 pe-10">
        <AbilityImage abilityId={ability.id} title="" className="size-12 shrink-0" />
        <div className="min-w-0">
          <Text as="div" variant="eyebrow" className="font-mono">
            {hero.name}
          </Text>
          <div className="font-game text-2xl tracking-tight text-balance uppercase">{ability.name}</div>
        </div>
      </div>
      <Stack gap={1} className="text-base text-muted-foreground">
        {lines.map((line, lineIndex) => (
          // oxlint-disable-next-line react/no-array-index-key -- the lines of one fixed text, in order
          <p key={lineIndex}>
            {line.map((run, runIndex) =>
              run.highlight ? (
                // oxlint-disable-next-line react/no-array-index-key -- the parts of one fixed line, in order
                <span key={runIndex} className="font-semibold text-foreground">
                  {run.text}
                </span>
              ) : (
                // oxlint-disable-next-line react/no-array-index-key -- the parts of one fixed line, in order
                <Fragment key={runIndex}>{run.text}</Fragment>
              ),
            )}
          </p>
        ))}
      </Stack>
    </Stack>
  );
}

/** An option: the tier and the ability points it costs. */
function TierOption() {
  const tier = useFlashcardEntry<UpgradeTier>();
  return (
    <span className="flex min-w-0 items-baseline gap-2 tracking-wide uppercase">
      <span>Tier {tier}</span>
      <span className="font-mono text-sm text-muted-foreground">{UPGRADE_TIER_COST[tier]} AP</span>
    </span>
  );
}
