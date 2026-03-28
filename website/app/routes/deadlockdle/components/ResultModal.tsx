import { AnimatePresence, motion } from "framer-motion";
import { Clock, Flame, Target, Trophy } from "lucide-react";
import { useEffect, useRef } from "react";

import { cn } from "~/lib/utils";

import { getDayNumber } from "../lib/seed";
import type { GameMode, GameStatus, StreakState } from "../lib/types";
import { useCountdown } from "../lib/use-countdown";
import { NextGameButton } from "./NextGameButton";
import { ShareButton } from "./ShareButton";

interface ResultModalProps {
  open: boolean;
  status: GameStatus;
  answer: string;
  mode: GameMode;
  date: string;
  guesses: string[];
  maxAttempts: number;
  streakState: StreakState;
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.15 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
};

export function ResultModal({ open, status, answer, mode, date, guesses, maxAttempts, streakState }: ResultModalProps) {
  const countdown = useCountdown();
  const containerRef = useRef<HTMLDivElement>(null);
  const isWin = status === "won";
  const dayNum = getDayNumber(date);
  const winRate = streakState.gamesPlayed > 0 ? Math.round((streakState.gamesWon / streakState.gamesPlayed) * 100) : 0;

  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        containerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={containerRef}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="mt-2"
        >
          {/* Outer border with status-colored accent line */}
          <div
            className={cn(
              "relative border bg-[#0a0e14]/90 backdrop-blur-md",
              isWin ? "border-green-500/20" : "border-primary/20",
            )}
          >
            {/* Top accent bar */}
            <div
              className={cn(
                "absolute inset-x-0 top-0 h-px",
                isWin
                  ? "bg-gradient-to-r from-transparent via-green-400 to-transparent"
                  : "bg-gradient-to-r from-transparent via-primary to-transparent",
              )}
            />

            <motion.div variants={stagger} initial="hidden" animate="show" className="p-5">
              {/* Header */}
              <motion.div variants={fadeUp} className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "flex size-9 items-center justify-center border",
                      isWin ? "border-green-500/30 bg-green-500/10" : "border-primary/30 bg-primary/10",
                    )}
                  >
                    {isWin ? <Trophy className="size-4 text-green-400" /> : <Target className="size-4 text-primary" />}
                  </div>
                  <div>
                    <p
                      className={cn(
                        "font-game text-base tracking-wider uppercase",
                        isWin ? "text-green-400" : "text-primary",
                      )}
                    >
                      {isWin ? "Target Eliminated" : "Mission Failed"}
                    </p>
                    <p className="font-mono text-[10px] tracking-wider text-muted-foreground/40 uppercase">
                      Puzzle #{dayNum}
                    </p>
                  </div>
                </div>
                <div
                  className={cn(
                    "border px-2.5 py-1 font-mono text-xs font-medium",
                    isWin
                      ? "border-green-500/30 bg-green-500/10 text-green-400"
                      : "border-primary/30 bg-primary/10 text-primary",
                  )}
                >
                  {isWin ? `${guesses.length}/${maxAttempts}` : `X/${maxAttempts}`}
                </div>
              </motion.div>

              {/* Answer reveal */}
              <motion.div
                variants={fadeUp}
                className="mb-4 border border-muted-foreground/10 bg-muted/20 px-3.5 py-2.5"
              >
                <span className="font-mono text-[10px] tracking-wider text-muted-foreground/40 uppercase">
                  [Answer]
                </span>
                <p className="mt-0.5 text-sm font-semibold text-foreground">{answer}</p>
              </motion.div>

              {/* Guess visualization */}
              <motion.div variants={fadeUp} className="mb-4">
                <div className="flex items-center gap-1.5">
                  {Array.from({ length: maxAttempts }, (_, i) => {
                    const wasGuess = i < guesses.length;
                    const wasCorrect = wasGuess && i === guesses.length - 1 && isWin;
                    return (
                      <motion.div
                        key={i}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.3 + i * 0.05, duration: 0.2, ease: "backOut" }}
                        className={cn(
                          "h-2 flex-1 border transition-colors",
                          wasCorrect
                            ? "border-green-400/60 bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]"
                            : wasGuess
                              ? "border-primary/40 bg-primary/70"
                              : "border-muted-foreground/15 bg-muted-foreground/5",
                        )}
                      />
                    );
                  })}
                </div>
              </motion.div>

              {/* Stats grid */}
              <motion.div variants={fadeUp} className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { icon: Target, label: "Played", value: streakState.gamesPlayed },
                  { icon: Trophy, label: "Win %", value: `${winRate}%` },
                  { icon: Flame, label: "Streak", value: streakState.currentStreak },
                  { icon: Flame, label: "Best", value: streakState.maxStreak },
                ].map((stat) => {
                  const StatIcon = stat.icon;
                  return (
                    <div
                      key={stat.label}
                      className="border border-muted-foreground/10 bg-muted/10 px-2 py-2 text-center"
                    >
                      <StatIcon className="mx-auto mb-1 size-3 text-muted-foreground/30" />
                      <p className="font-mono text-lg leading-none font-bold text-foreground">{stat.value}</p>
                      <p className="mt-1 text-[9px] tracking-wider text-muted-foreground/40 uppercase">{stat.label}</p>
                    </div>
                  );
                })}
              </motion.div>

              {/* Countdown */}
              <motion.div
                variants={fadeUp}
                className="mb-4 flex items-center justify-between border border-muted-foreground/10 bg-muted/10 px-3.5 py-2.5"
              >
                <div className="flex items-center gap-2">
                  <Clock className="size-3.5 text-muted-foreground/30" />
                  <span className="font-mono text-[10px] tracking-wider text-muted-foreground/40 uppercase">
                    Next Puzzle
                  </span>
                </div>
                <span className="font-mono text-sm font-bold tracking-widest text-foreground">{countdown}</span>
              </motion.div>

              {/* Actions */}
              <motion.div
                variants={fadeUp}
                className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end"
              >
                <ShareButton mode={mode} date={date} guesses={guesses} maxAttempts={maxAttempts} status={status} />
                <NextGameButton currentMode={mode} />
              </motion.div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
