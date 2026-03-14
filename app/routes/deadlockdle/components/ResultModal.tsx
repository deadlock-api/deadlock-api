import { AnimatePresence, motion } from "framer-motion";

import type { GameMode, GameStatus, StreakState } from "../lib/types";
import { useCountdown } from "../lib/use-countdown";
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

export function ResultModal({ open, status, answer, mode, date, guesses, maxAttempts, streakState }: ResultModalProps) {
  const countdown = useCountdown();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="mt-8 border border-muted-foreground/20 bg-[#0d1117]/80 p-6 backdrop-blur-sm"
        >
          <div className="mb-5 text-center">
            <p
              className={`font-game text-lg tracking-wider uppercase ${
                status === "won" ? "text-green-400" : "text-primary"
              }`}
            >
              {status === "won" ? "TARGET ELIMINATED" : "MISSION FAILED"}
            </p>
            <p className="mt-1 font-mono text-sm text-muted-foreground/60">
              The answer was <span className="font-semibold text-foreground">{answer}</span>
            </p>
          </div>

          <div className="mb-5 grid grid-cols-4 gap-3">
            {[
              { label: "Played", value: streakState.gamesPlayed },
              {
                label: "Win %",
                value:
                  streakState.gamesPlayed > 0 ? Math.round((streakState.gamesWon / streakState.gamesPlayed) * 100) : 0,
              },
              { label: "Streak", value: streakState.currentStreak },
              { label: "Best", value: streakState.maxStreak },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="font-mono text-xl font-bold">{stat.value}</p>
                <p className="text-[10px] tracking-wider text-muted-foreground/50 uppercase">{stat.label}</p>
              </div>
            ))}
          </div>

          <div className="mb-5 border-t border-b border-muted-foreground/10 py-3 text-center">
            <p className="mb-1 text-[10px] tracking-wider text-muted-foreground/40 uppercase">Next Puzzle</p>
            <p className="font-mono text-lg font-bold tracking-widest">{countdown}</p>
          </div>

          <div className="flex justify-center">
            <ShareButton mode={mode} date={date} guesses={guesses} maxAttempts={maxAttempts} status={status} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
