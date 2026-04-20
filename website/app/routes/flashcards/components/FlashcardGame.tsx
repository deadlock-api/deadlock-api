import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Check, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";

import { LoadingLogo } from "~/components/LoadingLogo";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import { cn } from "~/lib/utils";

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
  getIcon: (entry: T) => string;
  isLoading: boolean;
  storageKey: string;
  altLabel: string;
  completionLabel: string;
}

export function FlashcardGame<T extends FlashcardEntry>(props: FlashcardGameProps<T>) {
  if (props.isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <LoadingLogo className="h-16 w-16 animate-pulse" />
      </div>
    );
  }
  return <FlashcardGameReady {...props} />;
}

function FlashcardGameReady<T extends FlashcardEntry>({
  title,
  subtitle,
  pool,
  getIcon,
  storageKey,
  altLabel,
  completionLabel,
}: FlashcardGameProps<T>) {
  const [card, setCard] = useState<Card<T> | null>(() =>
    pool.length > 0 ? pickCard(pool, new Set()) : null,
  );
  const [selected, setSelected] = useState<number | null>(null);
  const [stats, setStats] = useState({ correct: 0, seen: 0, streak: 0, bestStreak: 0 });
  const [seenIds, setSeenIds] = useState<Set<number>>(new Set());
  const [noRepeats, setNoRepeats] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(storageKey) === "true";
  });
  const advanceTimer = useRef<number | null>(null);
  const noRepeatsRef = useRef(noRepeats);

  const updateNoRepeats = useCallback(
    (value: boolean) => {
      noRepeatsRef.current = value;
      setNoRepeats(value);
      localStorage.setItem(storageKey, String(value));
    },
    [storageKey],
  );

  useEffect(() => {
    return () => {
      if (advanceTimer.current !== null) window.clearTimeout(advanceTimer.current);
    };
  }, []);

  const handleChoice = useCallback(
    (id: number) => {
      if (!card || selected !== null) return;
      setSelected(id);
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
          const exclude = noRepeatsRef.current ? nextSeen : new Set<number>([card.answer.id]);
          setCard(pickCard(pool, exclude));
        },
        correct ? CORRECT_FEEDBACK_MS : WRONG_FEEDBACK_MS,
      );
    },
    [card, selected, pool, seenIds],
  );

  const resetStats = useCallback(() => {
    if (advanceTimer.current !== null) window.clearTimeout(advanceTimer.current);
    setStats({ correct: 0, seen: 0, streak: 0, bestStreak: 0 });
    setSelected(null);
    setSeenIds(new Set());
    setCard(pool.length > 0 ? pickCard(pool, new Set()) : null);
  }, [pool]);

  const accuracy = stats.seen > 0 ? Math.round((stats.correct / stats.seen) * 100) : 0;
  const exhausted = noRepeats && pool.length > 0 && seenIds.size >= pool.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="mx-auto max-w-3xl px-4 py-8"
    >
      <div className="mb-6">
        <Link
          to="/flashcards"
          className="mb-4 inline-flex items-center gap-1.5 font-mono text-xs tracking-wider text-muted-foreground/50 uppercase transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Hub
        </Link>
        <h1 className="bg-linear-to-b from-foreground to-foreground/50 bg-clip-text font-game text-2xl tracking-tight text-transparent uppercase">
          {title}
        </h1>
        <p className="mt-1 font-mono text-sm text-muted-foreground/60">{subtitle}</p>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3 border border-border bg-card/40 px-4 py-3 font-mono text-xs tracking-wider uppercase">
        <Stat label="Correct" value={`${stats.correct}/${stats.seen}`} />
        <Divider />
        <Stat label="Accuracy" value={`${accuracy}%`} />
        <Divider />
        <Stat label="Streak" value={`${stats.streak}`} highlight={stats.streak >= 3} />
        <Divider />
        <Stat label="Best" value={`${stats.bestStreak}`} />
        <Button
          variant="ghost"
          size="sm"
          onClick={resetStats}
          disabled={stats.seen === 0}
          className="ml-auto h-7 gap-1.5 px-2 text-xs"
        >
          <RotateCcw className="size-3" />
          Reset
        </Button>
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 px-1 font-mono text-xs tracking-wider uppercase">
        <Label
          htmlFor="flashcard-no-repeats"
          className="flex cursor-pointer items-center gap-2 text-muted-foreground/70 hover:text-foreground"
        >
          <Checkbox
            id="flashcard-no-repeats"
            checked={noRepeats}
            onCheckedChange={(v) => updateNoRepeats(v === true)}
          />
          <span>No repeats</span>
          {noRepeats && (
            <span className="text-muted-foreground/40 normal-case">
              ({seenIds.size}/{pool.length} seen)
            </span>
          )}
        </Label>
      </div>

      {exhausted || !card ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="flex flex-col items-center gap-4 border border-green-500/30 bg-green-500/5 px-6 py-12 text-center"
        >
          <div className="flex size-12 items-center justify-center rounded-full bg-green-500/15 text-green-400">
            <Check className="size-6" />
          </div>
          <div>
            <p className="font-game text-xl tracking-tight text-foreground uppercase">
              {completionLabel}
            </p>
            <p className="mt-1 font-mono text-xs tracking-wider text-muted-foreground/60 uppercase">
              You got {stats.correct}/{stats.seen} correct ({accuracy}%)
            </p>
          </div>
          <Button onClick={resetStats} variant="outline" className="gap-2">
            <RotateCcw className="size-4" />
            Play again
          </Button>
        </motion.div>
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
            <div className="relative">
              <div
                className={cn(
                  "flex size-40 items-center justify-center overflow-hidden rounded-2xl border bg-muted/30 ring-1 transition-colors duration-200 sm:size-52",
                  selected === null
                    ? "border-border/80 ring-border/30"
                    : selected === card.answer.id
                      ? "border-green-500/50 ring-green-500/30"
                      : "border-primary/50 ring-primary/30",
                )}
              >
                <img
                  src={getIcon(card.answer)}
                  alt={altLabel}
                  className="size-full object-contain"
                  draggable={false}
                />
              </div>
              <AnimatePresence>
                {selected !== null && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className={cn(
                      "absolute -top-2 -right-2 flex size-9 items-center justify-center rounded-full border-2 shadow-lg",
                      selected === card.answer.id
                        ? "border-green-400 bg-green-500 text-white"
                        : "border-primary/70 bg-primary text-primary-foreground",
                    )}
                  >
                    {selected === card.answer.id ? (
                      <Check className="size-5" />
                    ) : (
                      <X className="size-5" />
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
              {card.options.map((option) => {
                const isAnswer = option.id === card.answer.id;
                const isPicked = option.id === selected;
                const revealed = selected !== null;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => handleChoice(option.id)}
                    disabled={revealed}
                    className={cn(
                      "flex items-center justify-between border px-4 py-3 text-left font-mono text-sm font-medium tracking-wide uppercase transition-colors duration-150",
                      !revealed &&
                        "border-border bg-card hover:border-primary/50 hover:bg-primary/5 hover:text-primary",
                      revealed && isAnswer && "border-green-500/60 bg-green-500/10 text-green-300",
                      revealed &&
                        !isAnswer &&
                        isPicked &&
                        "border-primary/60 bg-primary/10 text-primary",
                      revealed &&
                        !isAnswer &&
                        !isPicked &&
                        "border-border/50 bg-card/40 text-muted-foreground/60",
                    )}
                  >
                    <span className="truncate">{option.name}</span>
                    {revealed && isAnswer && <Check className="size-4 shrink-0 text-green-400" />}
                    {revealed && !isAnswer && isPicked && (
                      <X className="size-4 shrink-0 text-primary" />
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </motion.div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-muted-foreground/50">{label}</span>
      <span className={cn("font-semibold text-foreground", highlight && "text-primary")}>
        {value}
      </span>
    </div>
  );
}

function Divider() {
  return <span className="text-muted-foreground/20">|</span>;
}
