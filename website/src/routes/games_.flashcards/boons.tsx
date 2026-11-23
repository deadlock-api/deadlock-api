import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { createContext, use, useMemo } from "react";

import { AbilityImage } from "~/components/domain/assets/AbilityImage";
import { HeroImage } from "~/components/domain/assets/HeroImage";
import { FlashcardPage } from "~/components/features/flashcards/FlashcardChrome";
import {
  FlashcardBoard,
  FlashcardOptions,
  FlashcardPrompt,
  useFlashcardEntry,
} from "~/components/features/flashcards/FlashcardGame";
import { GAME_GLYPH, SoulAmount, UpgradePips } from "~/components/features/flashcards/GameGlyphs";
import { useFlashcardDeck } from "~/components/features/flashcards/use-flashcard-deck";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Card } from "~/components/ui/card";
import { MaskedIcon } from "~/components/ui/masked-icon";
import { Text } from "~/components/ui/text";
import { useHydrated } from "~/hooks/useHydrated";
import { type BoonCard, type BoonLevel, boonCards, boonOptions, type SlotTier } from "~/lib/boons";
import { pageTitle, seo } from "~/lib/seo";
import {
  abilitiesQueryOptions,
  boonLevelsQueryOptions,
  playableHeroesQueryOptions,
  type SlimAbility,
  type SlimHero,
} from "~/queries/asset-queries";

export const Route = createFileRoute("/games_/flashcards/boons")({
  component: BoonFlashcards,
  head: () =>
    seo({
      title: pageTitle("Boon Flashcards - Souls for Ability Upgrades"),
      description:
        "Learn the Deadlock boon thresholds: at what net worth can your four abilities reach a given set of upgrades?",
      path: "/games/flashcards/boons",
    }),
});

const TITLE = "Boons";
const SUBTITLE = "At what net worth can your abilities reach these tiers?";

const SIGNATURE_SLOTS = ["signature1", "signature2", "signature3", "signature4"] as const;

/** A hero whose four ability icons dress a card: the slots of the question, as the game's ability bar shows them. */
interface CardHero {
  hero: SlimHero;
  abilities: SlimAbility[];
}

/** The playable heroes with all four abilities found, in id order. */
function cardHeroes(heroes: SlimHero[], abilities: SlimAbility[]): CardHero[] {
  const byClassName = new Map(abilities.map((ability) => [ability.class_name, ability]));
  return heroes
    .toSorted((a, b) => a.id - b.id)
    .flatMap((hero): CardHero[] => {
      const slots = SIGNATURE_SLOTS.map((slot) => byClassName.get(hero.items?.[slot] ?? ""));
      return slots.every((ability) => ability != null) ? [{ hero, abilities: slots }] : [];
    });
}

function BoonFlashcards() {
  const levelsQuery = useQuery(boonLevelsQueryOptions);
  const heroesQuery = useQuery(playableHeroesQueryOptions);
  const abilitiesQuery = useQuery(abilitiesQueryOptions);
  const queries = [levelsQuery, heroesQuery, abilitiesQuery];
  // The first card is drawn at random, so the server and client would disagree on it.
  const hydrated = useHydrated();
  const heroes = useMemo(
    () => (heroesQuery.data && abilitiesQuery.data ? cardHeroes(heroesQuery.data, abilitiesQuery.data) : []),
    [heroesQuery.data, abilitiesQuery.data],
  );

  if (queries.some((query) => query.isLoading) || !hydrated) {
    return (
      <FlashcardPage title={TITLE} subtitle={SUBTITLE}>
        <LoadingState label="flashcards" />
      </FlashcardPage>
    );
  }

  // A failed load would otherwise read as an empty deck.
  // The heroes only dress the cards; without the boon table there is nothing to ask.
  if (levelsQuery.isError && !levelsQuery.data) {
    return (
      <FlashcardPage title={TITLE} subtitle={SUBTITLE}>
        <ErrorState
          title="Could not load the cards"
          onRetry={() => void levelsQuery.refetch()}
          retrying={levelsQuery.isFetching}
        />
      </FlashcardPage>
    );
  }

  return <BoonFlashcardsReady levels={levelsQuery.data ?? []} heroes={heroes} />;
}

const formatSouls = (level: BoonLevel) => `${level.souls.toLocaleString("en-US")} souls`;

const HeroesContext = createContext<CardHero[]>([]);
const optionKey = (level: BoonLevel) => level.boon;
const answerKey = (card: BoonCard) => card.level.boon;
const answerName = (card: BoonCard) => formatSouls(card.level);

function BoonFlashcardsReady({ levels, heroes }: { levels: BoonLevel[]; heroes: CardHero[] }) {
  const pool = useMemo(() => boonCards(levels), [levels]);
  const draw = (cards: BoonCard[], excludeIds: Set<number>, random: () => number) => {
    const answerPool = cards.filter((card) => !excludeIds.has(card.id));
    if (answerPool.length === 0) return null;
    const answer = answerPool[Math.floor(random() * answerPool.length)];
    return { answer, options: boonOptions(answer.level, levels, random) };
  };

  const deck = useFlashcardDeck({
    pool,
    deck: "boons",
    draw,
    optionKey,
    optionName: formatSouls,
    answerKey,
    answerName,
  });

  return (
    <FlashcardBoard
      deck={deck}
      title={TITLE}
      subtitle={SUBTITLE}
      total={pool.length}
      masteredLabel="All boons mastered"
      emptyTitle="No boons found."
    >
      <HeroesContext value={heroes}>
        <FlashcardPrompt size="wide" mark="inline">
          <AbilitySlots />
        </FlashcardPrompt>
      </HeroesContext>
      <FlashcardOptions>
        <SoulsOption />
      </FlashcardOptions>
    </FlashcardBoard>
  );
}

/** The prompt: a hero's four abilities, each at its tier, as the game's ability bar shows them. */
function AbilitySlots() {
  const { id, slots } = useFlashcardEntry<BoonCard>();
  const heroes = use(HeroesContext);
  // The hero is the card's own, so a card always looks the same; without heroes the slots go bare.
  const dressed = heroes.length > 0 ? heroes[id % heroes.length] : undefined;
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      {dressed && (
        <div className="flex items-center gap-2">
          <HeroImage hero={dressed.hero} title="" shape="circle" className="size-6" />
          <Text as="div" variant="eyebrow" className="font-mono">
            {dressed.hero.name}
          </Text>
        </div>
      )}
      <ul aria-label="Ability tiers" className="grid grid-cols-4 gap-2">
        {slots.map((tier, index) => (
          // oxlint-disable-next-line react/no-array-index-key -- a slot is its position; the card never reorders them
          <li key={index}>
            <AbilitySlot tier={tier} ability={dressed?.abilities[index]} slot={index + 1} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function AbilitySlot({ tier, ability, slot }: { tier: SlotTier; ability?: SlimAbility; slot: number }) {
  const name = ability?.name ?? `Ability ${slot}`;
  return (
    <Card tone="inset" size="xs" radius="md" className="items-center px-2">
      <span className="sr-only">{tier === null ? `${name}: locked` : `${name}: tier ${tier}`}</span>
      <span aria-hidden="true" className="flex size-10 items-center justify-center">
        {tier === null ? (
          <MaskedIcon src={GAME_GLYPH.locked} className="size-6 text-muted-foreground" />
        ) : ability ? (
          <AbilityImage abilityId={ability.id} title="" className="size-10" />
        ) : (
          <span className="font-mono text-2xl font-semibold tabular-nums">{tier}</span>
        )}
      </span>
      <UpgradePips tier={tier ?? 0} />
    </Card>
  );
}

function SoulsOption() {
  const level = useFlashcardEntry<BoonLevel>();
  return <SoulAmount souls={level.souls} className="font-mono tracking-wide" />;
}
