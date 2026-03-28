import { ArrowRight, Home } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";

import { Button } from "~/components/ui/button";

import type { GameMode } from "../lib/types";
import { getDailyStatus } from "./GameCard";

const GAMES: { mode: GameMode; title: string; path: string }[] = [
  { mode: "guess-hero", title: "Guess the Hero", path: "/deadlockdle/guess-hero" },
  { mode: "guess-item", title: "Guess the Item", path: "/deadlockdle/guess-item" },
  { mode: "guess-sound", title: "Guess the Sound", path: "/deadlockdle/guess-sound" },
  { mode: "guess-ability", title: "Guess the Ability", path: "/deadlockdle/guess-ability" },
  { mode: "item-stats", title: "Item Stats Quiz", path: "/deadlockdle/item-stats" },
  { mode: "trivia", title: "Deadlock Trivia", path: "/deadlockdle/trivia" },
];

export function NextGameButton({ currentMode }: { currentMode: GameMode }) {
  const next = useMemo(() => {
    const currentIndex = GAMES.findIndex((g) => g.mode === currentMode);
    for (let i = 1; i < GAMES.length; i++) {
      const candidate = GAMES[(currentIndex + i) % GAMES.length];
      const status = getDailyStatus(candidate.mode);
      if (status !== "won" && status !== "lost") return candidate;
    }
    return null;
  }, [currentMode]);

  if (!next) {
    return (
      <Button
        asChild
        variant="outline"
        className="cursor-target font-mono text-xs tracking-wider uppercase hover:border-primary/60 hover:bg-primary/10"
      >
        <Link to="/deadlockdle" prefetch="intent">
          <Home className="mr-1.5 h-3.5 w-3.5" />
          All Complete
        </Link>
      </Button>
    );
  }

  return (
    <Button
      asChild
      variant="outline"
      className="cursor-target border-primary/40 font-mono text-xs font-semibold tracking-wider text-primary uppercase hover:border-primary/60 hover:bg-primary/10"
    >
      <Link to={next.path} prefetch="intent">
        {next.title}
        <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
      </Link>
    </Button>
  );
}
