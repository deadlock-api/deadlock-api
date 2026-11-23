import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Coins, GitBranch, ScrollText, ShoppingBag, Sparkles, Swords } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { GameTile } from "~/components/domain/minigames/GameTile";
import { enter, fadeUp, stagger, useEnterFrom } from "~/components/features/deadlockdle/motion";
import { Hero } from "~/components/patterns/page/Hero";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { pageTitle, seo } from "~/lib/seo";

export const Route = createFileRoute("/games_/flashcards/")({
  component: FlashcardsHub,
  head: () =>
    seo({
      title: pageTitle("Flashcards - Learn Deadlock Heroes and Items"),
      description:
        "Practice Deadlock heroes, items, item upgrade paths, ability upgrades and boons with multiple-choice flashcards.",
      path: "/games/flashcards",
    }),
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
  {
    title: "Ability Upgrades",
    description: "Match each hero ability upgrade to its tier: 1, 2 or 5 ability points.",
    icon: Sparkles,
    path: "/games/flashcards/ability-upgrades",
  },
  {
    title: "Boons",
    description: "Name the net worth at which your abilities can reach a set of upgrade tiers.",
    icon: Coins,
    path: "/games/flashcards/boons",
  },
];

function FlashcardsHub() {
  const enterHeader = useEnterFrom({ opacity: 0, scale: 0.95 });
  const enterTiles = useEnterFrom("hidden");
  return (
    <PageShell density="marketing" className="theme-terminal">
      <Hero size="sm">
        <motion.div initial={enterHeader} animate={{ opacity: 1, scale: 1 }} transition={enter}>
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
          initial={enterTiles}
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
