import { motion } from "framer-motion";
import { ArrowRight, ShoppingBag, Swords } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { MetaFunction } from "react-router";
import { Link } from "react-router";

import { createPageMeta } from "~/lib/meta";

export const meta: MetaFunction = () => {
  return createPageMeta({
    title: "Flashcards - Learn Deadlock Heroes and Items | Deadlock API",
    description: "Practice identifying Deadlock heroes and items by icon with multiple-choice flashcards.",
    path: "/flashcards",
  });
};

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
    path: "/flashcards/heroes",
  },
  {
    title: "Item Flashcards",
    description: "Identify shop items by their icon. Pick the correct name from four choices.",
    icon: ShoppingBag,
    path: "/flashcards/items",
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

export default function FlashcardsHub() {
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
          <h1 className="bg-linear-to-b from-foreground to-foreground/60 bg-clip-text font-game text-5xl font-normal tracking-tight text-transparent lg:text-6xl">
            Flashcards
          </h1>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.4 }}
          className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground"
        >
          Drill Deadlock heroes and items until you know every icon by heart.
        </motion.p>
      </section>

      <section className="mx-auto max-w-3xl">
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          {GAMES.map((game) => {
            const Icon = game.icon;
            return (
              <motion.div key={game.path} variants={fadeUp}>
                <Link to={game.path} prefetch="intent" className="group block h-full">
                  <div className="flex h-full flex-col border border-border bg-card p-4 transition-colors hover:border-primary/30 hover:bg-muted/30">
                    <div className="mb-2 flex items-center gap-3">
                      <div className="flex size-8 shrink-0 items-center justify-center border border-border bg-muted transition-colors group-hover:border-primary/20 group-hover:bg-primary/5">
                        <Icon className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
                      </div>
                      <h3 className="text-sm font-semibold text-foreground">{game.title}</h3>
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">{game.description}</p>
                    <div className="mt-auto flex items-center justify-between pt-2">
                      <span className="flex items-center gap-1 text-xs font-medium text-primary/80 transition-colors group-hover:text-primary">
                        Play
                        <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>
      </section>
    </div>
  );
}
