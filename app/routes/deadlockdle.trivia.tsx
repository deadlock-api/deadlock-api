import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MetaFunction } from "react-router";

import { LoadingLogo } from "~/components/LoadingLogo";
import { Button } from "~/components/ui/button";
import { createPageMeta } from "~/lib/meta";
import { cn } from "~/lib/utils";

import { GameShell } from "./deadlockdle/components/GameShell";
import { GuessFeedback } from "./deadlockdle/components/GuessFeedback";
import { useHeroes, useItems, useNpcUnits } from "./deadlockdle/lib/queries";
import { getDayNumber, getModeSeed, getTodayDate, seededRandom } from "./deadlockdle/lib/seed";
import { generateDailyQuestions, type TriviaQuestion } from "./deadlockdle/lib/trivia-questions";
import { useCountdown } from "./deadlockdle/lib/use-countdown";

export const meta: MetaFunction = () => {
  return createPageMeta({
    title: "Deadlock Trivia - Deadlockdle | Deadlock API",
    description: "Test your Deadlock knowledge with 10 daily trivia questions about heroes, items, and game mechanics.",
    path: "/deadlockdle/trivia",
  });
};

const QUESTION_COUNT = 10;
const STORAGE_KEY = "deadlockdle:trivia:game";
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

function loadState(): TriviaState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    return JSON.parse(raw) as TriviaState;
  } catch {
    return DEFAULT_STATE;
  }
}

function saveState(state: TriviaState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export default function Trivia() {
  const { data: heroes, isLoading: heroesLoading } = useHeroes();
  const { data: items, isLoading: itemsLoading } = useItems();
  const { data: npcUnits, isLoading: npcsLoading } = useNpcUnits();

  const today = getTodayDate();
  const countdown = useCountdown();
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [state, setState] = useState<TriviaState>(() => {
    const saved = loadState();
    if (saved.date !== today) {
      const fresh = { ...DEFAULT_STATE, date: today };
      saveState(fresh);
      return fresh;
    }
    return saved;
  });

  // Track which answer was just selected (for highlighting before auto-advance)
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [feedbackType, setFeedbackType] = useState<"correct" | "wrong" | null>(null);

  const isLoading = heroesLoading || itemsLoading || npcsLoading;

  const questions: TriviaQuestion[] = useMemo(() => {
    if (!heroes || !items || !npcUnits) return [];

    const seed = getModeSeed(today, "trivia");
    const rng = seededRandom(seed);
    return generateDailyQuestions(heroes, items, npcUnits, rng);
  }, [heroes, items, npcUnits, today]);

  const currentQ = questions[state.currentQuestion] ?? null;

  // Clean up timer on unmount
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
        currentQuestion: isLastQuestion ? state.currentQuestion : state.currentQuestion,
      };
      saveState(newState);
      setState(newState);

      // Auto-advance after delay
      advanceTimerRef.current = setTimeout(() => {
        setSelectedAnswer(null);
        setIsRevealed(false);

        if (!isLastQuestion) {
          const advancedState: TriviaState = {
            ...newState,
            currentQuestion: newState.currentQuestion + 1,
          };
          saveState(advancedState);
          setState(advancedState);
        }
      }, ADVANCE_DELAY_MS);
    },
    [state, isRevealed, currentQ],
  );

  const shareText = useMemo(() => {
    const dayNum = getDayNumber(today);
    return `Deadlockdle #${dayNum} - Trivia ${state.score}/${QUESTION_COUNT}\nhttps://deadlock-api.com/deadlockdle`;
  }, [today, state.score]);

  async function handleCopy() {
    await navigator.clipboard.writeText(shareText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (isLoading || questions.length === 0) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <LoadingLogo className="h-16 w-16 animate-pulse" />
      </div>
    );
  }

  const scoreColor = state.score >= 8 ? "text-green-400" : state.score >= 5 ? "text-amber-400" : "text-primary";

  return (
    <GameShell
      title="Deadlock Trivia"
      subtitle="10 questions to test your Deadlock knowledge"
      totalAttempts={0}
      usedAttempts={0}
      status={state.completed ? "won" : "playing"}
      hideAttempts
    >
      <GuessFeedback type={feedbackType} />

      <AnimatePresence mode="wait">
        {!state.completed && currentQ ? (
          <motion.div
            key={state.currentQuestion}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="space-y-5"
          >
            {/* Question counter */}
            <div className="text-center">
              <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground/40 uppercase">
                Question {state.currentQuestion + 1}/{QUESTION_COUNT}
              </p>
            </div>

            {/* Category badge */}
            <div className="flex justify-center">
              <span className="border border-muted-foreground/20 bg-muted-foreground/5 px-2.5 py-0.5 font-mono text-[10px] tracking-wider text-muted-foreground/50 uppercase">
                {currentQ.category}
              </span>
            </div>

            {/* Question text */}
            <p className="px-2 text-center text-lg font-semibold tracking-tight">{currentQ.question}</p>

            {/* Option buttons */}
            <div className="mx-auto max-w-md space-y-2.5">
              {currentQ.options.map((option, i) => {
                const isCorrectOption = i === currentQ.correctIndex;
                const isSelectedOption = i === selectedAnswer;
                const isWrongSelection = isRevealed && isSelectedOption && !isCorrectOption;

                return (
                  <motion.button
                    key={`${state.currentQuestion}-opt-${option}`}
                    type="button"
                    whileTap={!isRevealed ? { scale: 0.97, transition: { duration: 0 } } : undefined}
                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                    onClick={() => handleAnswer(i)}
                    disabled={isRevealed}
                    className={cn(
                      "w-full border px-4 py-3 text-left font-mono text-sm font-medium transition-colors",
                      "disabled:cursor-default",
                      isRevealed
                        ? isCorrectOption
                          ? "border-green-500 bg-green-500/15 text-green-400"
                          : isWrongSelection
                            ? "border-red-500 bg-red-500/15 text-red-400"
                            : "border-muted-foreground/10 bg-transparent text-muted-foreground/30"
                        : "border-muted-foreground/20 bg-[#0d1117]/60 text-foreground hover:border-primary/60 hover:bg-primary/5",
                    )}
                  >
                    {option}
                  </motion.button>
                );
              })}
            </div>

            {/* Progress dots */}
            <div className="flex justify-center gap-1.5 pt-2">
              {questions.map((q, i) => {
                const answered = state.answers[i] !== null;
                const correct = answered && state.answers[i] === q.correctIndex;
                const isCurrent = i === state.currentQuestion;

                return (
                  <div
                    key={q.question}
                    className={cn(
                      "h-2 w-2 rounded-full transition-all",
                      isCurrent
                        ? "scale-125 bg-primary"
                        : answered
                          ? correct
                            ? "bg-green-500"
                            : "bg-red-500"
                          : "bg-muted-foreground/20",
                    )}
                  />
                );
              })}
            </div>
          </motion.div>
        ) : state.completed ? (
          <motion.div
            key="results"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            {/* Score display */}
            <div className="border border-muted-foreground/20 bg-[#0d1117]/80 py-6 text-center backdrop-blur-sm">
              <p className={cn("font-mono text-4xl font-bold tracking-wider", scoreColor)}>
                {state.score}/{QUESTION_COUNT}
              </p>
              <p className="mt-2 text-[10px] tracking-wider text-muted-foreground/50 uppercase">
                {state.score >= 8 ? "Excellent" : state.score >= 5 ? "Not Bad" : "Keep Studying"}
              </p>
            </div>

            {/* Answer review */}
            <div className="space-y-1">
              {questions.map((q, i) => {
                const userAnswer = state.answers[i];
                const correct = userAnswer === q.correctIndex;
                return (
                  <div
                    key={q.question}
                    className={cn(
                      "flex items-center gap-2 border px-3 py-2 font-mono text-xs",
                      correct
                        ? "border-green-500/20 bg-green-500/5 text-green-400/80"
                        : "border-red-500/20 bg-red-500/5 text-red-400/80",
                    )}
                  >
                    <span className="w-4 shrink-0 text-center">{correct ? "\u2713" : "\u2717"}</span>
                    <span className="flex-1 truncate">{q.question}</span>
                    {!correct && <span className="shrink-0 text-muted-foreground/50">{q.options[q.correctIndex]}</span>}
                  </div>
                );
              })}
            </div>

            {/* Countdown */}
            <div className="border border-muted-foreground/10 py-4 text-center">
              <p className="mb-1 text-[10px] tracking-wider text-muted-foreground/40 uppercase">Next Trivia</p>
              <p className="font-mono text-lg font-bold tracking-widest">{countdown}</p>
            </div>

            {/* Share button */}
            <div className="flex justify-center">
              <Button
                onClick={handleCopy}
                variant="outline"
                className="border-primary/40 font-mono text-xs tracking-wider uppercase hover:border-primary/60 hover:bg-primary/10"
              >
                {copied ? (
                  <>
                    <Check className="mr-1.5 h-3.5 w-3.5" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="mr-1.5 h-3.5 w-3.5" /> Share Result
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </GameShell>
  );
}
