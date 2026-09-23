import { createFileRoute } from "@tanstack/react-router";
import type { Ability } from "deadlock_api_client";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState, type RefCallback } from "react";

import { AnswerOption, revealedState } from "~/components/domain/minigames/AnswerOption";
import { TerminalBadge } from "~/components/domain/minigames/TerminalBadge";
import { GameShell, GameShellError, GameShellLoading } from "~/components/features/deadlockdle/GameShell";
import { GuessFeedback } from "~/components/features/deadlockdle/GuessFeedback";
import { NextGameButton } from "~/components/features/deadlockdle/NextGameButton";
import { ScoreSummary } from "~/components/features/deadlockdle/ScoreSummary";
import { ShareButton } from "~/components/features/deadlockdle/ShareButton";
import { Card, CardContent } from "~/components/ui/card";
import { Stack } from "~/components/ui/stack";
import { StepMeter, StepMeterStep } from "~/components/ui/step-meter";
import { Text } from "~/components/ui/text";
import { useAbilities, useHeroes, useItems, useNpcUnits, puzzleLoadError } from "~/lib/deadlockdle/queries";
import {
  getDayNumber,
  getModeSeed,
  getTodayDate,
  puzzleShareUrl,
  resolvePuzzleDate,
  seededRandom,
  validatePuzzleDateSearch,
} from "~/lib/deadlockdle/seed";
import { gameStorageKey, legacyGameStorageKey } from "~/lib/deadlockdle/storage";
import {
  buildAbilitiesWithHeroes,
  generateDailyQuestions,
  type TriviaQuestion,
} from "~/lib/deadlockdle/trivia-questions";
import { useCountdown } from "~/lib/deadlockdle/use-countdown";
import { useStoredDailyState } from "~/lib/deadlockdle/use-stored-state";
import { seo } from "~/lib/seo";
import { filterPlayableHeroes } from "~/queries/asset-queries";

export const Route = createFileRoute("/games_/deadlockdle/trivia")({
  component: Trivia,
  validateSearch: validatePuzzleDateSearch,
  head: () =>
    seo({
      title: "Deadlock Trivia - Deadlockdle | Deadlock API",
      description:
        "Test your Deadlock knowledge with 10 daily trivia questions about heroes, items, and game mechanics.",
      path: "/games/deadlockdle/trivia",
    }),
});

const QUESTION_COUNT = 10;
const ADVANCE_DELAY_MS = 1200;

interface TriviaState {
  date: string;
  currentQuestion: number;
  answers: (number | null)[];
  score: number;
  completed: boolean;
}

const DEFAULT_STATE: TriviaState = {
  date: "",
  currentQuestion: 0,
  answers: Array.from<null>({ length: QUESTION_COUNT }).fill(null),
  score: 0,
  completed: false,
};

function freshState(date: string): TriviaState {
  return { ...DEFAULT_STATE, date };
}

function Trivia() {
  const heroesQuery = useHeroes();
  const { data: heroes, isLoading: heroesLoading } = heroesQuery;
  const itemsQuery = useItems();
  const { data: items, isLoading: itemsLoading } = itemsQuery;
  const npcUnitsQuery = useNpcUnits();
  const { data: npcUnits, isLoading: npcsLoading } = npcUnitsQuery;
  const abilitiesQuery = useAbilities();
  const { data: rawAbilities, isLoading: abilitiesLoading } = abilitiesQuery;

  const { date: dateParam } = Route.useSearch();
  const date = resolvePuzzleDate(dateParam);
  const isArchive = date !== getTodayDate();
  const storageKey = gameStorageKey("trivia", date);
  const countdown = useCountdown();
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [state, saveState] = useStoredDailyState(storageKey, date, freshState, legacyGameStorageKey("trivia"));

  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  // The question just answered, shown with its result until the advance; the stored state has already moved on.
  const [revealing, setRevealing] = useState<number | null>(null);
  const isRevealed = revealing !== null;
  const [feedbackType, setFeedbackType] = useState<"correct" | "wrong" | null>(null);

  const isLoading = heroesLoading || itemsLoading || npcsLoading || abilitiesLoading;

  const abilitiesWithHeroes = useMemo(() => {
    if (!rawAbilities || !heroes) return [];
    return buildAbilitiesWithHeroes(rawAbilities as Ability[], filterPlayableHeroes(heroes));
  }, [rawAbilities, heroes]);

  const questions: TriviaQuestion[] = useMemo(() => {
    if (!heroes || !items || !npcUnits) return [];

    const seed = getModeSeed(date, "trivia");
    const rng = seededRandom(seed);
    return generateDailyQuestions(heroes, items, npcUnits, abilitiesWithHeroes, rng);
  }, [heroes, items, npcUnits, abilitiesWithHeroes, date]);

  const shownIndex = revealing ?? state.currentQuestion;
  // Answering disables the options and the next question replaces them, which drops focus to <body>; after an answer
  // the next question's first option takes it back, so the quiz can be played with the keyboard alone.
  const answered = useRef(false);
  const focusFirstOption = useCallback((element: HTMLButtonElement | null) => {
    if (element && answered.current && document.activeElement === document.body) element.focus();
  }, []);
  const currentQ = questions[shownIndex] ?? null;

  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    };
  }, []);

  const handleAnswer = useCallback(
    (optionIndex: number) => {
      if (state.completed || isRevealed || !currentQ || state.answers[state.currentQuestion] != null) return;

      const isCorrect = optionIndex === currentQ.correctIndex;
      setSelectedAnswer(optionIndex);
      setRevealing(state.currentQuestion);
      answered.current = true;
      setFeedbackType(isCorrect ? "correct" : "wrong");
      setTimeout(() => setFeedbackType(null), 900);

      const newAnswers = [...state.answers];
      newAnswers[state.currentQuestion] = optionIndex;
      const newScore = state.score + (isCorrect ? 1 : 0);

      const isLastQuestion = state.currentQuestion >= QUESTION_COUNT - 1;

      // The answer and the move to the next question are one write: saving the move only after the reveal let a
      // reload in between show the answered question again and score it twice.
      saveState({
        ...state,
        answers: newAnswers,
        score: newScore,
        completed: isLastQuestion,
        currentQuestion: isLastQuestion ? state.currentQuestion : state.currentQuestion + 1,
      });

      advanceTimerRef.current = setTimeout(() => {
        setSelectedAnswer(null);
        setRevealing(null);
      }, ADVANCE_DELAY_MS);
    },
    [state, isRevealed, currentQ, saveState],
  );

  const shareText = useMemo(() => {
    const dayNum = getDayNumber(date);
    return `Deadlockdle #${dayNum} - Trivia ${state.score}/${QUESTION_COUNT}\n${puzzleShareUrl(date)}`;
  }, [date, state.score]);

  const resultsScrollRef = useCallback<RefCallback<HTMLDivElement>>((node) => {
    if (node) {
      // Reached by answering the last question, whose options unmount: the results take focus instead of <body>.
      if (answered.current) node.focus({ preventScroll: true });
      setTimeout(() => node.scrollIntoView({ behavior: "smooth", block: "nearest" }), 150);
    }
  }, []);
  // The last answer is saved as completed at once; its reveal still plays before the results replace it.
  const showResults = state.completed && !isRevealed;

  // A failed query leaves no puzzle to build, so without this the loader would spin forever.
  const loadError = puzzleLoadError(heroesQuery, itemsQuery, npcUnitsQuery, abilitiesQuery);
  if (loadError.isError) {
    return (
      <GameShellError
        title="Deadlock Trivia"
        subtitle="10 questions to test your Deadlock knowledge"
        date={date}
        onRetry={loadError.retry}
        retrying={loadError.retrying}
      />
    );
  }

  if (isLoading || questions.length === 0) {
    return (
      <GameShellLoading title="Deadlock Trivia" subtitle="10 questions to test your Deadlock knowledge" date={date} />
    );
  }

  return (
    <GameShell
      title="Deadlock Trivia"
      subtitle="10 questions to test your Deadlock knowledge"
      totalAttempts={0}
      usedAttempts={0}
      status={showResults ? "won" : "playing"}
      hideAttempts
      date={date}
    >
      <GuessFeedback type={feedbackType} triggerKey={shownIndex} />

      <AnimatePresence mode="wait">
        {!showResults && currentQ ? (
          <motion.div
            key={shownIndex}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="flex flex-col gap-5"
          >
            <Text as="p" variant="eyebrow" align="center" className="font-mono">
              Question {shownIndex + 1}/{QUESTION_COUNT}
            </Text>

            <div className="flex justify-center">
              <TerminalBadge variant="outline" size="sm" className="text-muted-foreground">
                {currentQ.category}
              </TerminalBadge>
            </div>

            <p className="px-2 text-center text-lg font-semibold tracking-tight">{currentQ.question}</p>

            <Stack gap={2.5} className="mx-auto w-full max-w-lg">
              {currentQ.options.map((option, i) => (
                <AnswerOption
                  key={`${shownIndex}-opt-${option}`}
                  ref={i === 0 ? focusFirstOption : undefined}
                  state={isRevealed ? revealedState(i === currentQ.correctIndex, i === selectedAnswer) : "idle"}
                  onClick={() => handleAnswer(i)}
                  disabled={isRevealed}
                >
                  {option}
                </AnswerOption>
              ))}
            </Stack>

            <StepMeter label={`Question ${shownIndex + 1} of ${QUESTION_COUNT}`} className="justify-center pt-2">
              {questions.map((q, i) => (
                <StepMeterStep
                  key={q.question}
                  state={
                    i === shownIndex
                      ? "current"
                      : state.answers[i] === null
                        ? "empty"
                        : state.answers[i] === q.correctIndex
                          ? "correct"
                          : "wrong"
                  }
                />
              ))}
            </StepMeter>
          </motion.div>
        ) : showResults ? (
          <motion.div
            key="results"
            ref={resultsScrollRef}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col gap-6"
          >
            <ScoreSummary
              score={`${state.score}/${QUESTION_COUNT}`}
              scoreLabel={state.score >= 8 ? "Excellent" : state.score >= 5 ? "Not Bad" : "Keep Studying"}
              grade={state.score >= 8 ? "good" : state.score >= 5 ? "fair" : "poor"}
              countdown={isArchive ? undefined : { label: "Next Trivia", value: countdown }}
            />

            <Stack gap={1}>
              {questions.map((q, i) => {
                const tone = state.answers[i] === q.correctIndex ? "positive" : "negative";
                return (
                  <Card key={q.question} tone={tone} size="xs">
                    <CardContent className="flex items-center gap-2 font-mono text-xs">
                      <Text tone={tone} variant="caption" align="center" className="w-4 shrink-0">
                        {tone === "positive" ? "✓" : "✗"}
                      </Text>
                      <Text tone={tone} variant="caption" wrap="truncate" className="flex-1">
                        {q.question}
                      </Text>
                      {tone === "negative" && (
                        <Text tone="muted" variant="caption" className="shrink-0">
                          {q.options[q.correctIndex]}
                        </Text>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </Stack>

            <div className="flex flex-col items-center gap-3">
              <ShareButton text={shareText}>Share Result</ShareButton>
              <NextGameButton currentMode="trivia" date={date} />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </GameShell>
  );
}
