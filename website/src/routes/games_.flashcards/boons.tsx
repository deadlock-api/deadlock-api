import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { useMemo } from "react";

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
import { Card } from "~/components/ui/card";
import { Pips } from "~/components/ui/pips";
import { useHydrated } from "~/hooks/useHydrated";
import { type BoonCard, type BoonLevel, boonCards, boonOptions, type SlotTier } from "~/lib/boons";
import { pageTitle, seo } from "~/lib/seo";
import { boonLevelsQueryOptions } from "~/queries/asset-queries";

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

function BoonFlashcards() {
  const { data: levels, isLoading, isError, isFetching, refetch } = useQuery(boonLevelsQueryOptions);
  // The first card is drawn at random, so the server and client would disagree on it.
  const hydrated = useHydrated();

  if (isLoading || !hydrated) {
    return (
      <FlashcardPage title={TITLE} subtitle={SUBTITLE}>
        <LoadingState label="flashcards" />
      </FlashcardPage>
    );
  }

  // A failed load would otherwise read as an empty deck.
  if (isError && !levels) {
    return (
      <FlashcardPage title={TITLE} subtitle={SUBTITLE}>
        <ErrorState title="Could not load the cards" onRetry={() => void refetch()} retrying={isFetching} />
      </FlashcardPage>
    );
  }

  return <BoonFlashcardsReady levels={levels ?? []} />;
}

const formatSouls = (level: BoonLevel) => `${level.souls.toLocaleString("en-US")} souls`;
const optionKey = (level: BoonLevel) => level.boon;
const answerKey = (card: BoonCard) => card.level.boon;
const answerName = (card: BoonCard) => formatSouls(card.level);

function BoonFlashcardsReady({ levels }: { levels: BoonLevel[] }) {
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
      <FlashcardPrompt size="wide" mark="inline">
        <AbilitySlots />
      </FlashcardPrompt>
      <FlashcardOptions>
        <SoulsOption />
      </FlashcardOptions>
    </FlashcardBoard>
  );
}

/** The prompt: the tier of each of the four abilities. */
function AbilitySlots() {
  const { slots } = useFlashcardEntry<BoonCard>();
  return (
    <ul aria-label="Ability tiers" className="grid flex-1 grid-cols-4 gap-2">
      {slots.map((tier, index) => (
        // oxlint-disable-next-line react/no-array-index-key -- a slot is its position; the card never reorders them
        <li key={index}>
          <AbilitySlot tier={tier} />
        </li>
      ))}
    </ul>
  );
}

function AbilitySlot({ tier }: { tier: SlotTier }) {
  return (
    <Card tone="inset" size="xs" radius="md" className="items-center px-2">
      <span aria-hidden="true" className="flex h-9 items-center font-mono text-3xl font-semibold tabular-nums">
        {tier === null ? <Lock className="size-6 text-muted-foreground" /> : tier}
      </span>
      <Pips value={tier ?? 0} max={3} size="default" label={tier === null ? "Locked" : `Tier ${tier}`} />
    </Card>
  );
}

function SoulsOption() {
  const level = useFlashcardEntry<BoonLevel>();
  return <span className="font-mono tracking-wide tabular-nums">{formatSouls(level)}</span>;
}
