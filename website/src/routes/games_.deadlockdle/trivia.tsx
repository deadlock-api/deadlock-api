import { createFileRoute } from "@tanstack/react-router";
import type { Ability } from "deadlock_api_client";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState, type RefCallback } from "react";

import { AnswerOption, revealedState } from "~/components/domain/minigames/AnswerOption";
import { TerminalBadge } from "~/components/domain/minigames/TerminalBadge";
import { GameShell, GameShellLoading } from "~/components/features/deadlockdle/GameShell";
import { GuessFeedback } from "~/components/features/deadlockdle/GuessFeedback";
import { NextGameButton } from "~/components/features/deadlockdle/NextGameButton";
import { ScoreSummary } from "~/components/features/deadlockdle/ScoreSummary";
import { ShareButton } from "~/components/features/deadlockdle/ShareButton";
import { Card, CardContent } from "~/components/ui/card";
import { Stack } from "~/components/ui/stack";
import { StepMeter, StepMeterStep } from "~/components/ui/step-meter";
import { Text } from "~/components/ui/text";
import { useAbilities, useHeroes, useItems, useNpcUnits } from "~/lib/deadlockdle/queries";
import {
  getDayNumber,
  getModeSeed,
  getTodayDate,
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
  const { data: heroes, isLoading: heroesLoading } = useHeroes();
  const { data: items, isLoading: itemsLoading } = useItems();
  const { data: npcUnits, isLoading: npcsLoading } = useNpcUnits();
  const { data: rawAbilities, isLoading: abilitiesLoading } = useAbilities();

  const { date: dateParam } = Route.useSearch();
  const date = resolvePuzzleDate(dateParam);
  const isArchive = date !== getTodayDate();
  const storageKey = gameStorageKey("trivia", date);
  const countdown = useCountdown();
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [state, saveState] = useStoredDailyState(storageKey, date, freshState, legacyGameStorageKey("trivia"));

  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
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

  const currentQ = questions[state.currentQuestion] ?? null;

  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    };
  }, []);

  const handleAnswer = useCallback(
    (optionIndex: number) => {
      if (state.completed || isRevealed || !currentQ) return;

      const isCorrect = optionIndex === currentQ.correctIndex;
      setSelectedAnswer(optionIndex);
      setIsRevealed(true);
      setFeedbackType(isCorrect ? "correct" : "wrong");
      setTimeout(() => setFeedbackType(null), 900);

      const newAnswers = [...state.answers];
      newAnswers[state.currentQuestion] = optionIndex;
      const newScore = state.score + (isCorrect ? 1 : 0);

      const isLastQuestion = state.currentQuestion >= QUESTION_COUNT - 1;

      const newState: TriviaState = {
        ...state,
        answers: newAnswers,
        score: newScore,
        completed: isLastQuestion,
      };
      saveState(newState);

      advanceTimerRef.current = setTimeout(() => {
        setSelectedAnswer(null);
        setIsRevealed(false);

        if (!isLastQuestion) {
          const advancedState: TriviaState = {
            ...newState,
            currentQuestion: newState.currentQuestion + 1,
          };
          saveState(advancedState);
        }
      }, ADVANCE_DELAY_MS);
    },
    [state, isRevealed, currentQ, saveState],
  );

  const shareText = useMemo(() => {
    const dayNum = getDayNumber(date);
    return `Deadlockdle #${dayNum} - Trivia ${state.score}/${QUESTION_COUNT}\nhttps://deadlock-api.com/games/deadlockdle`;
  }, [date, state.score]);

  const resultsScrollRef = useCallback<RefCallback<HTMLDivElement>>((node) => {
    if (node) {
      setTimeout(() => node.scrollIntoView({ behavior: "smooth", block: "nearest" }), 150);
    }
  }, []);

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
      status={state.completed ? "won" : "playing"}
      hideAttempts
      date={date}
    >
      <GuessFeedback type={feedbackType} triggerKey={state.currentQuestion} />

      <AnimatePresence mode="wait">
        {!state.completed && currentQ ? (
          <motion.div
            key={state.currentQuestion}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="flex flex-col gap-5"
          >
            <Text as="p" variant="eyebrow" align="center" className="font-mono">
              Question {state.currentQuestion + 1}/{QUESTION_COUNT}
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
                  key={`${state.currentQuestion}-opt-${option}`}
                  state={isRevealed ? revealedState(i === currentQ.correctIndex, i === selectedAnswer) : "idle"}
                  onClick={() => handleAnswer(i)}
                  disabled={isRevealed}
                >
                  {option}
                </AnswerOption>
              ))}
            </Stack>

            <StepMeter
              label={`Question ${state.currentQuestion + 1} of ${QUESTION_COUNT}`}
              className="justify-center pt-2"
            >
              {questions.map((q, i) => (
                <StepMeterStep
                  key={q.question}
                  state={
                    i === state.currentQuestion
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
        ) : state.completed ? (
          <motion.div
            key="results"
            ref={resultsScrollRef}
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
