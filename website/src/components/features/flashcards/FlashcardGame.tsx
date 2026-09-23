import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { AnswerOption, revealedState } from "~/components/domain/minigames/AnswerOption";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { useHydrated } from "~/hooks/useHydrated";
import { readLocalStorage, writeLocalStorage } from "~/lib/local-storage";
import { cn } from "~/lib/utils";

import {
  EMPTY_FLASHCARD_STATS,
  FlashcardMastered,
  FlashcardPage,
  FlashcardStatStrip,
  NoRepeatsToggle,
  PromptFrame,
  ResultMark,
} from "./FlashcardChrome";

const OPTION_COUNT = 4;
const CORRECT_FEEDBACK_MS = 500;
const WRONG_FEEDBACK_MS = 1500;

export interface FlashcardEntry {
  id: number;
  name: string;
}

interface Card<T extends FlashcardEntry> {
  answer: T;
  options: T[];
}

function pickCard<T extends FlashcardEntry>(pool: T[], excludeIds: Set<number>): Card<T> | null {
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

export interface FlashcardGameProps<T extends FlashcardEntry> {
  title: string;
  subtitle: string;
  pool: T[];
  renderPrompt: (entry: T) => ReactNode;
  renderOption?: (entry: T) => ReactNode;
  promptClassName?: string;
  controls?: ReactNode;
  /** Changing this value draws a fresh card (stats and progress are kept). */
  reshuffleKey?: string;
  isLoading: boolean;
  /** The deck's data failed to load: an error with a retry, instead of an empty deck ("No cards available."). */
  isError?: boolean;
  onRetry?: () => void;
  retrying?: boolean;
  storageKey: string;
  masteredLabel: string;
}

function renderNameOption<T extends FlashcardEntry>(entry: T): ReactNode {
  return <span className="truncate tracking-wide uppercase">{entry.name}</span>;
}

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
  renderPrompt,
  renderOption = renderNameOption,
  promptClassName = "size-40 sm:size-52",
  controls,
  reshuffleKey,
  storageKey,
  masteredLabel,
}: FlashcardGameProps<T>) {
  const [card, setCard] = useState<Card<T> | null>(() => (pool.length > 0 ? pickCard(pool, new Set()) : null));
  const [selected, setSelected] = useState<number | null>(null);
  const [stats, setStats] = useState(EMPTY_FLASHCARD_STATS);
  const [seenIds, setSeenIds] = useState<Set<number>>(new Set());
  const [noRepeats, setNoRepeats] = useState(() => readLocalStorage(storageKey) === "true");
  const advanceTimer = useRef<number | null>(null);
  const noRepeatsRef = useRef(noRepeats);
  const prevReshuffleKey = useRef(reshuffleKey);

  const updateNoRepeats = useCallback(
    (value: boolean) => {
      noRepeatsRef.current = value;
      setNoRepeats(value);
      writeLocalStorage(storageKey, String(value));
      // Allowing repeats again after the pool was mastered: deal a card rather than stay on "mastered".
      if (!value && card === null && pool.length > 0) setCard(pickCard(pool, new Set()));
    },
    [storageKey, card, pool],
  );

  useEffect(() => {
    return () => {
      if (advanceTimer.current !== null) window.clearTimeout(advanceTimer.current);
    };
  }, []);

  // Answering disables the options and the next card replaces them, dropping focus to <body>; after an answer the next
  // card's first option takes it back, so the deck can be played with the keyboard alone.
  const answered = useRef(false);
  const focusFirstOption = useCallback((element: HTMLButtonElement | null) => {
    if (element && answered.current && document.activeElement === document.body) element.focus();
  }, []);

  const handleChoice = useCallback(
    (id: number) => {
      if (!card || selected !== null) return;
      setSelected(id);
      answered.current = true;
      const correct = id === card.answer.id;
      setStats((prev) => {
        const nextStreak = correct ? prev.streak + 1 : 0;
        return {
          correct: prev.correct + (correct ? 1 : 0),
          seen: prev.seen + 1,
          streak: nextStreak,
          bestStreak: Math.max(prev.bestStreak, nextStreak),
        };
      });
      const nextSeen = new Set(seenIds);
      if (correct) nextSeen.add(card.answer.id);
      advanceTimer.current = window.setTimeout(
        () => {
          setSelected(null);
          setSeenIds(nextSeen);
          // Without no-repeats only the card just seen is skipped, unless it is the only one.
          const exclude = noRepeatsRef.current ? nextSeen : new Set<number>(pool.length > 1 ? [card.answer.id] : []);
          setCard(pickCard(pool, exclude));
        },
        correct ? CORRECT_FEEDBACK_MS : WRONG_FEEDBACK_MS,
      );
    },
    [card, selected, pool, seenIds],
  );

  const redraw = useCallback(() => {
    if (advanceTimer.current !== null) window.clearTimeout(advanceTimer.current);
    setSelected(null);
    const exclude = noRepeatsRef.current ? seenIds : new Set<number>(card && pool.length > 1 ? [card.answer.id] : []);
    setCard(pickCard(pool, exclude));
  }, [pool, seenIds, card]);

  useEffect(() => {
    if (prevReshuffleKey.current === reshuffleKey) return;
    prevReshuffleKey.current = reshuffleKey;
    redraw();
  }, [reshuffleKey, redraw]);

  const resetStats = useCallback(() => {
    if (advanceTimer.current !== null) window.clearTimeout(advanceTimer.current);
    setStats(EMPTY_FLASHCARD_STATS);
    setSelected(null);
    setSeenIds(new Set());
    setCard(pool.length > 0 ? pickCard(pool, new Set()) : null);
  }, [pool]);

  const empty = pool.length === 0;
  // A filter can shrink the pool below cards already mastered; only the ones still in it count.
  const masteredInPool = pool.reduce((count, entry) => count + Number(seenIds.has(entry.id)), 0);
  const exhausted = noRepeats && pool.length > 0 && masteredInPool >= pool.length;

  return (
    <FlashcardPage title={title} subtitle={subtitle}>
      <FlashcardStatStrip stats={stats} onReset={resetStats} />

      <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-xs tracking-wider uppercase">
        <NoRepeatsToggle
          id="flashcard-no-repeats"
          checked={noRepeats}
          onCheckedChange={updateNoRepeats}
          mastered={masteredInPool}
          total={pool.length}
        />
        {controls}
      </div>

      {empty ? (
        <EmptyState title="No cards available." />
      ) : exhausted || !card ? (
        <FlashcardMastered label={masteredLabel} stats={stats} onReset={resetStats} />
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
            <div className={cn("relative", promptClassName)}>
              <PromptFrame
                verdict={selected === null ? null : selected === card.answer.id ? "correct" : "wrong"}
                className="size-full"
              >
                {renderPrompt(card.answer)}
              </PromptFrame>
              <AnimatePresence>
                {selected !== null && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="absolute end-2 top-2"
                  >
                    <ResultMark correct={selected === card.answer.id} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
              {card.options.map((option, index) => (
                <AnswerOption
                  key={option.id}
                  ref={index === 0 ? focusFirstOption : undefined}
                  state={
                    selected === null ? "idle" : revealedState(option.id === card.answer.id, option.id === selected)
                  }
                  onClick={() => handleChoice(option.id)}
                  disabled={selected !== null}
                >
                  {renderOption(option)}
                </AnswerOption>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </FlashcardPage>
  );
}
