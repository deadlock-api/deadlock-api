import newRockerWoff2 from "@fontsource/new-rocker/files/new-rocker-latin-400-normal.woff2?url";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Crosshair,
  Ear,
  HelpCircle,
  Puzzle,
  ShoppingBag,
  Swords,
} from "lucide-react";
import { useMemo, useState } from "react";

import { type DailyStatus, GameCard, getDailyResult, getDailyStatus } from "~/components/deadlockdle/GameCard";
import { Button } from "~/components/ui/button";
import { day } from "~/dayjs";
import {
  EPOCH_DATE,
  getDayNumber,
  getTodayDate,
  isValidPuzzleDate,
  resolvePuzzleDate,
  validatePuzzleDateSearch,
} from "~/lib/deadlockdle/seed";
import type { GameMode } from "~/lib/deadlockdle/types";
import { seo } from "~/lib/seo";

export const Route = createFileRoute("/deadlockdle/")({
  component: DeadlockdleHub,
  validateSearch: validatePuzzleDateSearch,
  head: () => {
    const s = seo({
      title: "Deadlockdle - Daily Deadlock Minigames | Deadlock API",
      description: "Test your Deadlock knowledge with daily puzzles. Guess heroes, items, sounds, abilities, and more.",
      path: "/deadlockdle",
    });
    return {
      ...s,
      links: [
        ...s.links,
        {
          rel: "preload",
          href: newRockerWoff2,
          as: "font",
          type: "font/woff2",
          crossOrigin: "anonymous",
        },
      ],
    };
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
    path: "/deadlockdle/guess-hero",
    shareLabel: "Hero",
  },
  {
    mode: "guess-item",
    title: "Guess the Item",
    description: "Name the item from a blurred shop image. Gets clearer each attempt.",
    icon: ShoppingBag,
    path: "/deadlockdle/guess-item",
    shareLabel: "Item",
  },
  {
    mode: "guess-sound",
    title: "Guess the Sound",
    description: "Listen to an ability sound and name the exact ability.",
    icon: Ear,
    path: "/deadlockdle/guess-sound",
    shareLabel: "Sound",
  },
  {
    mode: "guess-ability",
    title: "Guess the Ability",
    description: "See an ability icon. Name the exact ability.",
    icon: Swords,
    path: "/deadlockdle/guess-ability",
    shareLabel: "Ability",
  },
  {
    mode: "item-stats",
    title: "Item Stats Quiz",
    description: "Fill in the missing stats for each item. How well do you know your shop?",
    icon: Puzzle,
    path: "/deadlockdle/item-stats",
    shareLabel: "Stats",
  },
  {
    mode: "trivia",
    title: "Deadlock Trivia",
    description: "10 questions about heroes, items, NPCs, and game mechanics.",
    icon: HelpCircle,
    path: "/deadlockdle/trivia",
    shareLabel: "Trivia",
  },
];

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: "easeOut" as const },
  },
};

function buildShareText(date: string, statuses: Record<GameMode, DailyStatus>): string {
  const lines: string[] = [`Deadlockdle Day ${getDayNumber(date)}`, ""];

  for (const game of GAMES) {
    const status = statuses[game.mode];
    const result = getDailyResult(game.mode, date);
    const emoji = status === "won" ? "✅" : "❌";
    const detail = result ? ` (${result})` : "";
    lines.push(`${emoji} ${game.shareLabel}${detail}`);
  }

  lines.push("", "https://deadlock-api.com/deadlockdle");
  return lines.join("\n");
}

function DeadlockdleHub() {
  const { date: dateParam } = Route.useSearch();
  const navigate = useNavigate();
  const today = getTodayDate();
  const date = resolvePuzzleDate(dateParam);
  const isArchive = date !== today;
  const dayNum = getDayNumber(date);
  const [copied, setCopied] = useState(false);

  const statuses = useMemo(() => {
    if (typeof window === "undefined") return null;
    const result = {} as Record<GameMode, DailyStatus>;
    for (const game of GAMES) {
      result[game.mode] = getDailyStatus(game.mode, date);
    }
    return result;
  }, [date]);

  const prevDate = day(date).subtract(1, "day").format("YYYY-MM-DD");
  const nextDate = day(date).add(1, "day").format("YYYY-MM-DD");

  function goToDate(target: string) {
    if (!isValidPuzzleDate(target)) return;
    navigate({ to: "/deadlockdle", search: target === today ? {} : { date: target } });
  }

  const allFinished = useMemo(
    () => statuses != null && GAMES.every((g) => statuses[g.mode] === "won" || statuses[g.mode] === "lost"),
    [statuses],
  );

  return (
    <div className="space-y-10">
      <section className="relative pt-4 pb-2 text-center">
        <div className="pointer-events-none absolute top-0 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/8 blur-[100px]" />

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative"
        >
          <div className="relative inline-block">
            <h1 className="bg-gradient-to-b from-foreground to-foreground/60 bg-clip-text font-game text-5xl font-normal tracking-tight text-transparent lg:text-6xl">
              Deadlockdle
            </h1>
            <span className="absolute -top-2 -right-10 font-game text-sm font-semibold text-primary/70">
              Day {dayNum}
            </span>
          </div>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.4 }}
          className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground"
        >
          {isArchive
            ? `Replaying the puzzles from ${day(date).format("MMMM D, YYYY")}.`
            : "Test your Deadlock knowledge with daily puzzles. New challenges every day."}
        </motion.p>

        <div className="relative mt-5 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => goToDate(prevDate)}
            disabled={!isValidPuzzleDate(prevDate)}
            title="Previous day"
            className="cursor-target flex size-8 items-center justify-center border border-border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronLeft className="size-4" />
          </button>

          <label className="flex items-center gap-2 border border-border bg-card px-3 py-1.5 text-muted-foreground focus-within:border-primary/40">
            <CalendarDays className="size-3.5 text-muted-foreground/50" />
            <input
              type="date"
              value={date}
              min={EPOCH_DATE}
              max={today}
              onChange={(e) => goToDate(e.target.value)}
              className="cursor-target bg-transparent font-mono text-xs text-foreground [color-scheme:dark] outline-none"
            />
          </label>

          <button
            type="button"
            onClick={() => goToDate(nextDate)}
            disabled={!isValidPuzzleDate(nextDate)}
            title="Next day"
            className="cursor-target flex size-8 items-center justify-center border border-border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronRight className="size-4" />
          </button>

          {isArchive && (
            <Button
              onClick={() => goToDate(today)}
              variant="outline"
              className="cursor-target h-8 border-primary/30 font-mono text-xs tracking-wider uppercase hover:border-primary/50 hover:bg-primary/5"
            >
              Today
            </Button>
          )}
        </div>
      </section>

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
              <GameCard {...game} date={date} />
            </motion.div>
          ))}
        </motion.div>
      </section>

      <AnimatePresence>
        {allFinished && statuses && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
            className="flex justify-center"
          >
            <Button
              onClick={async () => {
                const text = buildShareText(date, statuses);
                await navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              variant="outline"
              className="cursor-target gap-1.5 border-primary/30 px-6 hover:border-primary/50 hover:bg-primary/5"
            >
              {copied ? (
                <>
                  <Check className="size-3.5" /> Copied
                </>
              ) : (
                <>
                  <Copy className="size-3.5" /> Share All Results
                </>
              )}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
