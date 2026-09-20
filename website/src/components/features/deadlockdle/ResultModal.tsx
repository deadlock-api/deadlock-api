import { AnimatePresence, motion } from "framer-motion";
import { Clock, Target, Trophy } from "lucide-react";
import { useEffect, useRef } from "react";

import { TerminalBadge } from "~/components/domain/minigames/TerminalBadge";
import { Card, CardContent } from "~/components/ui/card";
import { IconTile } from "~/components/ui/icon-tile";
import { Inline, Stack } from "~/components/ui/stack";
import { Stat, StatGroup } from "~/components/ui/stat";
import { StepMeter, StepMeterStep } from "~/components/ui/step-meter";
import { Text } from "~/components/ui/text";
import { getDayNumber } from "~/lib/deadlockdle/seed";
import type { GameMode, GameStatus, StreakState } from "~/lib/deadlockdle/types";
import { useCountdown } from "~/lib/deadlockdle/use-countdown";

import { attemptState } from "./AttemptsIndicator";
import { DURATION, enter, fadeUp, stagger } from "./motion";
import { NextGameButton } from "./NextGameButton";
import { generateShareText, ShareButton } from "./ShareButton";

interface ResultModalProps {
  open: boolean;
  status: GameStatus;
  answer: string;
  mode: GameMode;
  date: string;
  guesses: string[];
  maxAttempts: number;
  streakState: StreakState;
  isArchive?: boolean;
}

const MotionStack = motion.create(Stack);
const MotionInline = motion.create(Inline);
const MotionStep = motion.create(StepMeterStep);

export function ResultModal({
  open,
  status,
  answer,
  mode,
  date,
  guesses,
  maxAttempts,
  streakState,
  isArchive,
}: ResultModalProps) {
  const countdown = useCountdown();
  const containerRef = useRef<HTMLDivElement>(null);
  const isWin = status === "won";
  const tone = isWin ? "positive" : "negative";
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
          transition={enter}
        >
          <Card tone={tone} size="flush" accent={`var(--${tone})`}>
            <MotionStack variants={stagger} initial="hidden" animate="show" gap={4} className="p-5">
              <MotionInline variants={fadeUp} justify="between" wrap="nowrap">
                <Inline gap={3} wrap="nowrap">
                  <IconTile tone={tone} size="sm">
                    {isWin ? <Trophy /> : <Target />}
                  </IconTile>
                  <Stack gap={0}>
                    <Text as="p" tone={tone} className="font-game text-base tracking-wider uppercase">
                      {isWin ? "Target Eliminated" : "Mission Failed"}
                    </Text>
                    <Text as="p" variant="eyebrow" className="font-mono">
                      Puzzle #{dayNum}
                    </Text>
                  </Stack>
                </Inline>
                <TerminalBadge variant={tone}>
                  {isWin ? `${guesses.length}/${maxAttempts}` : `X/${maxAttempts}`}
                </TerminalBadge>
              </MotionInline>

              <motion.div variants={fadeUp}>
                <Card tone="inset" size="xs">
                  <CardContent>
                    <Stack gap={0.5}>
                      <Text variant="eyebrow" className="font-mono">
                        [Answer]
                      </Text>
                      <Text as="p" variant="label">
                        {answer}
                      </Text>
                    </Stack>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div variants={fadeUp}>
                <StepMeter
                  variant="track"
                  label={
                    isWin
                      ? `Solved in ${guesses.length} of ${maxAttempts} attempts`
                      : `All ${maxAttempts} attempts used`
                  }
                >
                  {Array.from({ length: maxAttempts }, (_, i) => (
                    <MotionStep
                      key={i}
                      state={attemptState(i, guesses.length, isWin, false)}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{
                        delay: DURATION.slow + i * (DURATION.fast / 3),
                        duration: DURATION.normal,
                        ease: "backOut",
                      }}
                    />
                  ))}
                </StepMeter>
              </motion.div>

              <motion.div variants={fadeUp}>
                <StatGroup variant="tiles" size="sm" className="grid-cols-2 gap-2 font-mono sm:grid-cols-4">
                  <Stat align="center" label="Played" value={streakState.gamesPlayed} />
                  <Stat align="center" label="Win %" value={`${winRate}%`} />
                  <Stat align="center" label="Streak" value={streakState.currentStreak} />
                  <Stat align="center" label="Best" value={streakState.maxStreak} />
                </StatGroup>
              </motion.div>

              {!isArchive && (
                <motion.div variants={fadeUp}>
                  <Card tone="inset" size="xs">
                    <CardContent className="flex items-center justify-between">
                      <Text variant="eyebrow" className="flex items-center gap-2 font-mono">
                        <Clock className="size-3.5" />
                        Next Puzzle
                      </Text>
                      <Text className="font-mono font-bold tracking-widest" tone="default">
                        {countdown}
                      </Text>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              <motion.div
                variants={fadeUp}
                className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end"
              >
                <ShareButton text={() => generateShareText(mode, date, guesses, maxAttempts, status)}>
                  Share Result
                </ShareButton>
                <NextGameButton currentMode={mode} date={date} />
              </motion.div>
            </MotionStack>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
