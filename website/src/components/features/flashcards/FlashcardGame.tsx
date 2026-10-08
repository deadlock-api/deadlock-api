import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { createContext, use } from "react";

import { AnswerOption } from "~/components/domain/minigames/AnswerOption";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { useHydrated } from "~/hooks/useHydrated";
import { cn } from "~/lib/utils";

import {
  AnswerAnnouncement,
  FlashcardMastered,
  FlashcardPage,
  FlashcardStatStrip,
  NoRepeatsToggle,
  PromptFrame,
  ResultMark,
} from "./FlashcardChrome";
import { type FlashcardCard, type FlashcardDeck, useFlashcardDeck } from "./use-flashcard-deck";

const OPTION_COUNT = 4;

export interface FlashcardEntry {
  id: number;
  name: string;
}

function pickCard<T extends FlashcardEntry>(pool: T[], excludeIds: Set<number>): FlashcardCard<T, T> | null {
  const answerPool = pool.filter((h) => !excludeIds.has(h.id));
  if (answerPool.length === 0) return null;
  const answer = answerPool[Math.floor(Math.random() * answerPool.length)];

  const distractors: T[] = [];
  const used = new Set<number>([answer.id]);
  const optionTarget = Math.min(OPTION_COUNT, pool.length);
  while (distractors.length < optionTarget - 1) {
    const candidate = pool[Math.floor(Math.random() * pool.length)];
    if (used.has(candidate.id)) continue;
    used.add(candidate.id);
    distractors.push(candidate);
  }

  const options = [answer, ...distractors];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }

  return { answer, options };
}

const entryId = (entry: FlashcardEntry) => entry.id;

const DeckContext = createContext<FlashcardDeck<FlashcardEntry, FlashcardEntry> | null>(null);
const EntryContext = createContext<FlashcardEntry | null>(null);

function useDeck() {
  const deck = use(DeckContext);
  if (!deck?.card) throw new Error("FlashcardPrompt and FlashcardOptions must be children of a FlashcardGame");
  return { ...deck, card: deck.card };
}

/** The entry of the card part it is rendered in: the answer inside `FlashcardPrompt`, an option inside `FlashcardOptions`. */
export function useFlashcardEntry<T extends FlashcardEntry>(): T {
  const entry = use(EntryContext);
  if (!entry) throw new Error("useFlashcardEntry must be used inside FlashcardPrompt or FlashcardOptions");
  return entry as T;
}

export interface FlashcardGameProps<T extends FlashcardEntry> {
  title: string;
  subtitle: string;
  pool: T[];
  /** The card: a `FlashcardPrompt` and `FlashcardOptions`, whose children read their entry with `useFlashcardEntry`. */
  children: ReactNode;
  controls?: ReactNode;
  /** Changing this value draws a fresh card (stats and progress are kept). */
  reshuffleKey?: string;
  isLoading: boolean;
  /** The deck's data failed to load: an error with a retry, instead of an empty deck ("No cards available."). */
  isError?: boolean;
  onRetry?: () => void;
  retrying?: boolean;
  /** Names the deck's saved settings and progress (`flashcards:<deck>:*` in storage). */
  deck: string;
  masteredLabel: string;
}

/** A multiple-choice deck over `pool`. Its behaviour is `useFlashcardDeck`; the card is the children. */
export function FlashcardGame<T extends FlashcardEntry>(props: FlashcardGameProps<T>) {
  // The first card is drawn at random, so the server and client would disagree on it.
  const hydrated = useHydrated();
  if (props.isLoading || !hydrated) {
    return (
      <FlashcardPage title={props.title} subtitle={props.subtitle}>
        <LoadingState label="flashcards" />
      </FlashcardPage>
    );
  }
  if (props.isError && props.pool.length === 0) {
    return (
      <FlashcardPage title={props.title} subtitle={props.subtitle}>
        <ErrorState title="Could not load the cards" onRetry={props.onRetry} retrying={props.retrying} />
      </FlashcardPage>
    );
  }
  return <FlashcardGameReady {...props} />;
}

function FlashcardGameReady<T extends FlashcardEntry>({
  title,
  subtitle,
  pool,
  children,
  controls,
  reshuffleKey,
  deck: deckName,
  masteredLabel,
}: FlashcardGameProps<T>) {
  const deck = useFlashcardDeck<FlashcardEntry, FlashcardEntry>({
    pool,
    deck: deckName,
    draw: pickCard,
    optionKey: entryId,
    answerKey: entryId,
    reshuffleKey,
  });
  const { card } = deck;

  return (
    <FlashcardPage title={title} subtitle={subtitle}>
      <FlashcardStatStrip stats={deck.stats} onReset={deck.reset} />
      <AnswerAnnouncement verdict={deck.verdict} answer={card?.answer.name ?? ""} />

      <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-xs tracking-wider uppercase">
        <NoRepeatsToggle
          id="flashcard-no-repeats"
          checked={deck.noRepeats}
          onCheckedChange={deck.setNoRepeats}
          mastered={deck.masteredInPool}
          total={pool.length}
        />
        {controls}
      </div>

      {!deck.dealt ? (
        <LoadingState label="flashcards" />
      ) : deck.empty ? (
        <EmptyState title="No cards available." />
      ) : deck.finished || !card ? (
        <FlashcardMastered label={masteredLabel} stats={deck.stats} onReset={deck.reset} />
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={card.answer.id}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="flex flex-col items-center gap-6"
          >
            <DeckContext value={deck}>{children}</DeckContext>
          </motion.div>
        </AnimatePresence>
      )}
    </FlashcardPage>
  );
}

const PROMPT_SIZE = {
  /** A square for an icon or portrait. */
  icon: "size-40 sm:size-52",
  /** A text card as wide as the options. */
  wide: "w-full max-w-xl",
};

/** What the card asks about: the answer, in a frame tinted by the verdict with the verdict's mark in its corner. */
export function FlashcardPrompt({ size = "icon", children }: { size?: keyof typeof PROMPT_SIZE; children: ReactNode }) {
  const { card, verdict, revealed } = useDeck();
  return (
    <div className={cn("relative", PROMPT_SIZE[size])}>
      <PromptFrame verdict={verdict} className="size-full">
        <EntryContext value={card.answer}>{children}</EntryContext>
      </PromptFrame>
      <AnimatePresence>
        {revealed && (
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="absolute inset-e-2 top-2"
          >
            <ResultMark correct={verdict === "correct"} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** The entry's name, the default face of an option. */
export function FlashcardName() {
  const entry = useFlashcardEntry();
  return <span className="truncate tracking-wide uppercase">{entry.name}</span>;
}

const NAME_FACE = <FlashcardName />;

/** The answers to pick from, by click or number key; `children` is the face of each (its name by default). */
export function FlashcardOptions({ children = NAME_FACE }: { children?: ReactNode }) {
  const { card, stateOf, choose, revealed, focusFirstOption } = useDeck();
  return (
    <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
      {card.options.map((option, index) => (
        <AnswerOption
          key={option.id}
          ref={index === 0 ? focusFirstOption : undefined}
          state={stateOf(option)}
          onClick={() => choose(option)}
          shortcut={String(index + 1)}
          aria-disabled={revealed || undefined}
        >
          <EntryContext value={option}>{children}</EntryContext>
        </AnswerOption>
      ))}
    </div>
  );
}
