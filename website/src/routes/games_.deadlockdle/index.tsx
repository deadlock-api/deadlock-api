import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Crosshair, Ear, HelpCircle, Puzzle, ShoppingBag, Swords } from "lucide-react";
import { useMemo } from "react";

import { TerminalButton } from "~/components/domain/minigames/TerminalButton";
import { type DailyStatus, GameCard, getDailyResult, getDailyStatus } from "~/components/features/deadlockdle/GameCard";
import { DURATION, enter, fadeUp, stagger } from "~/components/features/deadlockdle/motion";
import { ShareButton } from "~/components/features/deadlockdle/ShareButton";
import { Hero, HeroActions } from "~/components/patterns/page/Hero";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { Input } from "~/components/ui/input";
import { day } from "~/dayjs";
import { useHydrated } from "~/hooks/useHydrated";
import {
  EPOCH_DATE,
  getDayNumber,
  getTodayDate,
  isValidPuzzleDate,
  puzzleShareUrl,
  resolvePuzzleDate,
  validatePuzzleDateSearch,
} from "~/lib/deadlockdle/seed";
import { readCurrentStreak } from "~/lib/deadlockdle/storage";
import type { GameMode } from "~/lib/deadlockdle/types";
import { pageTitle, seo } from "~/lib/seo";

export const Route = createFileRoute("/games_/deadlockdle/")({
  component: DeadlockdleHub,
  validateSearch: validatePuzzleDateSearch,
  head: () => {
    const s = seo({
      title: pageTitle("Deadlockdle - Daily Deadlock Minigames"),
      description: "Test your Deadlock knowledge with daily puzzles. Guess heroes, items, sounds, abilities, and more.",
      path: "/games/deadlockdle",
    });
    return s;
  },
});

const GAMES: {
  mode: GameMode;
  title: string;
  description: string;
  icon: typeof Crosshair;
  path: string;
  shareLabel: string;
}[] = [
  {
    mode: "guess-hero",
    title: "Guess the Hero",
    description: "Identify the hero from their silhouette. Clues revealed with each guess.",
    icon: Crosshair,
    path: "/games/deadlockdle/guess-hero",
    shareLabel: "Hero",
  },
  {
    mode: "guess-item",
    title: "Guess the Item",
    description: "Name the item from a blurred shop image. Gets clearer each attempt.",
    icon: ShoppingBag,
    path: "/games/deadlockdle/guess-item",
    shareLabel: "Item",
  },
  {
    mode: "guess-sound",
    title: "Guess the Sound",
    description: "Listen to an ability sound and name the exact ability.",
    icon: Ear,
    path: "/games/deadlockdle/guess-sound",
    shareLabel: "Sound",
  },
  {
    mode: "guess-ability",
    title: "Guess the Ability",
    description: "See an ability icon. Name the exact ability.",
    icon: Swords,
    path: "/games/deadlockdle/guess-ability",
    shareLabel: "Ability",
  },
  {
    mode: "item-stats",
    title: "Item Stats Quiz",
    description: "Name the activation, tier and slot of five items. How well do you know your shop?",
    icon: Puzzle,
    path: "/games/deadlockdle/item-stats",
    shareLabel: "Stats",
  },
  {
    mode: "trivia",
    title: "Deadlock Trivia",
    description: "10 questions about heroes, items, NPCs, and game mechanics.",
    icon: HelpCircle,
    path: "/games/deadlockdle/trivia",
    shareLabel: "Trivia",
  },
];

function buildShareText(date: string, statuses: Record<GameMode, DailyStatus>): string {
  const lines: string[] = [`Deadlockdle Day ${getDayNumber(date)}`, ""];

  for (const game of GAMES) {
    const status = statuses[game.mode];
    const result = getDailyResult(game.mode, date);
    const emoji = status === "won" ? "✅" : "❌";
    const detail = result ? ` (${result})` : "";
    lines.push(`${emoji} ${game.shareLabel}${detail}`);
  }

  lines.push("", puzzleShareUrl(date));
  return lines.join("\n");
}

function DeadlockdleHub() {
  const { date: dateParam } = Route.useSearch();
  const navigate = useNavigate();
  const today = getTodayDate();
  const date = resolvePuzzleDate(dateParam);
  const isArchive = date !== today;
  const dayNum = getDayNumber(date);

  // Saved progress lives in the browser; reading it before hydration would make the server markup differ.
  const hydrated = useHydrated();
  const statuses = useMemo(() => {
    if (!hydrated) return null;
    const result = {} as Record<GameMode, DailyStatus>;
    for (const game of GAMES) {
      result[game.mode] = getDailyStatus(game.mode, date);
    }
    return result;
  }, [date, hydrated]);
  const streaks = useMemo(() => {
    if (!hydrated) return null;
    const result = {} as Record<GameMode, number>;
    for (const game of GAMES) {
      result[game.mode] = readCurrentStreak(game.mode);
    }
    return result;
  }, [hydrated]);

  const prevDate = day(date).subtract(1, "day").format("YYYY-MM-DD");
  const nextDate = day(date).add(1, "day").format("YYYY-MM-DD");

  function goToDate(target: string) {
    if (!isValidPuzzleDate(target)) return;
    void navigate({ to: "/games/deadlockdle", search: target === today ? {} : { date: target } });
  }

  const allFinished = useMemo(
    () => statuses != null && GAMES.every((g) => statuses[g.mode] === "won" || statuses[g.mode] === "lost"),
    [statuses],
  );

  return (
    <PageShell density="marketing" className="theme-terminal">
      <Hero size="sm">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={enter}>
          <PageHeader
            size="display"
            eyebrow={<span className="font-game text-sm font-semibold text-primary">Day {dayNum}</span>}
            title={<span className="font-game font-normal">Deadlockdle</span>}
            description={
              isArchive
                ? `Replaying the puzzles from ${day(date).format("MMMM D, YYYY")}.`
                : "Test your Deadlock knowledge with daily puzzles. New challenges every day."
            }
          />
        </motion.div>

        <HeroActions className="gap-2">
          <TerminalButton
            size="icon-sm"
            onClick={() => goToDate(prevDate)}
            disabled={!isValidPuzzleDate(prevDate)}
            aria-label="Previous day"
            title="Previous day"
          >
            <ChevronLeft />
          </TerminalButton>

          <Input
            type="date"
            aria-label="Puzzle date"
            value={date}
            min={EPOCH_DATE}
            max={today}
            onChange={(e) => goToDate(e.target.value)}
            size="sm"
            className="cursor-target w-auto font-mono text-xs [color-scheme:dark] md:text-xs"
          />

          <TerminalButton
            size="icon-sm"
            onClick={() => goToDate(nextDate)}
            disabled={!isValidPuzzleDate(nextDate)}
            aria-label="Next day"
            title="Next day"
          >
            <ChevronRight />
          </TerminalButton>

          {isArchive && (
            <TerminalButton size="sm" onClick={() => goToDate(today)}>
              Today
            </TerminalButton>
          )}
        </HeroActions>
      </Hero>

      <section>
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.1 }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3"
        >
          {GAMES.map((game) => (
            <motion.div key={game.mode} variants={fadeUp}>
              <GameCard
                {...game}
                date={date}
                status={statuses?.[game.mode] ?? "untouched"}
                streak={streaks?.[game.mode] ?? 0}
              />
            </motion.div>
          ))}
        </motion.div>
      </section>

      <AnimatePresence>
        {allFinished && statuses && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION.slow, delay: DURATION.fast }}
            className="flex justify-center"
          >
            <ShareButton variant="soft" text={() => buildShareText(date, statuses)}>
              Share All Results
            </ShareButton>
          </motion.div>
        )}
      </AnimatePresence>
    </PageShell>
  );
}
