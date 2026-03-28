import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, Crosshair, Ear, HelpCircle, Puzzle, ShoppingBag, Swords } from "lucide-react";
import { useMemo, useState } from "react";
import type { MetaFunction } from "react-router";

import { Button } from "~/components/ui/button";
import { createPageMeta } from "~/lib/meta";

import { type DailyStatus, GameCard, getDailyResult, getDailyStatus } from "./deadlockdle/components/GameCard";
import { getDayNumber, getTodayDate } from "./deadlockdle/lib/seed";
import type { GameMode } from "./deadlockdle/lib/types";

export const meta: MetaFunction = () => {
  return createPageMeta({
    title: "Deadlockdle - Daily Deadlock Minigames | Deadlock API",
    description: "Test your Deadlock knowledge with daily puzzles. Guess heroes, items, sounds, abilities, and more.",
    path: "/deadlockdle",
  });
};

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

function buildShareText(dayNum: number, statuses: Record<GameMode, DailyStatus>): string {
  const lines: string[] = [`Deadlockdle Day ${dayNum}`, ""];

  for (const game of GAMES) {
    const status = statuses[game.mode];
    const result = getDailyResult(game.mode);
    const emoji = status === "won" ? "\u2705" : "\u274C";
    const detail = result ? ` (${result})` : "";
    lines.push(`${emoji} ${game.shareLabel}${detail}`);
  }

  lines.push("", "https://deadlock-api.com/deadlockdle");
  return lines.join("\n");
}

export default function DeadlockdleHub() {
  const today = getTodayDate();
  const dayNum = getDayNumber(today);
  const [copied, setCopied] = useState(false);

  const statuses = useMemo(() => {
    const result = {} as Record<GameMode, DailyStatus>;
    for (const game of GAMES) {
      result[game.mode] = getDailyStatus(game.mode);
    }
    return result;
  }, []);

  const allFinished = useMemo(
    () => GAMES.every((g) => statuses[g.mode] === "won" || statuses[g.mode] === "lost"),
    [statuses],
  );

  return (
    <div className="space-y-10">
      {/* Heading */}
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
          Test your Deadlock knowledge with daily puzzles. New challenges every day.
        </motion.p>
      </section>

      {/* Game cards */}
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
              <GameCard {...game} />
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Share button */}
      <AnimatePresence>
        {allFinished && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
            className="flex justify-center"
          >
            <Button
              onClick={async () => {
                const text = buildShareText(dayNum, statuses);
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
