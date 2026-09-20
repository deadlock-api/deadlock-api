import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { GitBranch, ScrollText, ShoppingBag, Swords } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { GameTile } from "~/components/domain/minigames/GameTile";
import { enter, fadeUp, stagger } from "~/components/features/deadlockdle/motion";
import { Hero } from "~/components/patterns/page/Hero";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { seo } from "~/lib/seo";

export const Route = createFileRoute("/games_/flashcards/")({
  component: FlashcardsHub,
  head: () => {
    const s = seo({
      title: "Flashcards - Learn Deadlock Heroes and Items | Deadlock API",
      description:
        "Practice identifying Deadlock heroes, items, and item upgrade paths with multiple-choice flashcards.",
      path: "/games/flashcards",
    });
    return s;
  },
});

const GAMES: {
  title: string;
  description: string;
  icon: LucideIcon;
  path: string;
}[] = [
  {
    title: "Hero Flashcards",
    description: "Identify heroes by their icon. Pick the correct name from four choices.",
    icon: Swords,
    path: "/games/flashcards/heroes",
  },
  {
    title: "Item Flashcards",
    description: "Identify shop items by their icon. Pick the correct name from four choices.",
    icon: ShoppingBag,
    path: "/games/flashcards/items",
  },
  {
    title: "Item Effects",
    description: "Identify items by their stats and effects, or pick the right effects for a named item.",
    icon: ScrollText,
    path: "/games/flashcards/item-effects",
  },
  {
    title: "Item Upgrade Paths",
    description: "Match upgraded items to the component items they build from.",
    icon: GitBranch,
    path: "/games/flashcards/item-upgrades",
  },
];

function FlashcardsHub() {
  return (
    <PageShell density="marketing" className="theme-terminal">
      <Hero size="sm">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={enter}>
          <PageHeader
            size="display"
            title={<span className="font-game font-normal">Flashcards</span>}
            description="Drill Deadlock heroes, items, and upgrade paths until the shop clicks."
          />
        </motion.div>
      </Hero>

      <section className="mx-auto w-full max-w-5xl">
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {GAMES.map((game) => (
            <motion.div key={game.path} variants={fadeUp}>
              <GameTile to={game.path} title={game.title} description={game.description} icon={game.icon} />
            </motion.div>
          ))}
        </motion.div>
      </section>
    </PageShell>
  );
}
