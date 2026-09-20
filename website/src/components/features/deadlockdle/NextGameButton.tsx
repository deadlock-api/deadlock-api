import { Link } from "@tanstack/react-router";
import { ArrowRight, Home } from "lucide-react";
import { useMemo } from "react";

import { TerminalButton } from "~/components/domain/minigames/TerminalButton";
import { getTodayDate } from "~/lib/deadlockdle/seed";
import type { GameMode } from "~/lib/deadlockdle/types";

import { getDailyStatus } from "./GameCard";

const GAMES: { mode: GameMode; title: string; path: string }[] = [
  { mode: "guess-hero", title: "Guess the Hero", path: "/games/deadlockdle/guess-hero" },
  { mode: "guess-item", title: "Guess the Item", path: "/games/deadlockdle/guess-item" },
  { mode: "guess-sound", title: "Guess the Sound", path: "/games/deadlockdle/guess-sound" },
  { mode: "guess-ability", title: "Guess the Ability", path: "/games/deadlockdle/guess-ability" },
  { mode: "item-stats", title: "Item Stats Quiz", path: "/games/deadlockdle/item-stats" },
  { mode: "trivia", title: "Deadlock Trivia", path: "/games/deadlockdle/trivia" },
];

export function NextGameButton({ currentMode, date = getTodayDate() }: { currentMode: GameMode; date?: string }) {
  const search = date === getTodayDate() ? {} : { date };

  const next = useMemo(() => {
    const currentIndex = GAMES.findIndex((g) => g.mode === currentMode);
    for (let i = 1; i < GAMES.length; i++) {
      const candidate = GAMES[(currentIndex + i) % GAMES.length];
      const status = getDailyStatus(candidate.mode, date);
      if (status !== "won" && status !== "lost") return candidate;
    }
    return null;
  }, [currentMode, date]);

  if (!next) {
    return (
      <TerminalButton asChild>
        <Link to="/games/deadlockdle" search={search} preload="intent">
          <Home />
          All Complete
        </Link>
      </TerminalButton>
    );
  }

  return (
    <TerminalButton asChild variant="soft">
      <Link to={next.path} search={search} preload="intent">
        {next.title}
        <ArrowRight />
      </Link>
    </TerminalButton>
  );
}
