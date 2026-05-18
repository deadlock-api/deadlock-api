import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { HeroV2 } from "assets_deadlock_api_client/api";
import { useMemo } from "react";

import { FlashcardGame } from "~/components/flashcards/FlashcardGame";
import { seo } from "~/lib/seo";
import { filterPlayableHeroes, heroesQueryOptions } from "~/queries/asset-queries";

export const Route = createFileRoute("/flashcards/heroes")({
  component: HeroFlashcards,
  head: () =>
    seo({
      title: "Hero Flashcards - Learn Heroes by Icon | Deadlock API",
      description: "Memorize Deadlock heroes by their icon. Multiple-choice flashcard drill with instant feedback.",
      path: "/flashcards/heroes",
    }),
});

function heroIconSrc(hero: HeroV2): string {
  return hero.images?.icon_image_small_webp ?? hero.images?.icon_image_small ?? "";
}

function HeroFlashcards() {
  const { data: heroes, isLoading } = useQuery(heroesQueryOptions);

  const pool = useMemo(() => {
    if (!heroes) return [];
    return filterPlayableHeroes(heroes);
  }, [heroes]);

  return (
    <FlashcardGame
      title="Hero Flashcards"
      subtitle="Identify the hero from their icon. Pick the correct name."
      pool={pool}
      getIcon={heroIconSrc}
      isLoading={isLoading}
      storageKey="flashcards:heroes:no-repeats"
      altLabel="Mystery hero"
      masteredLabel="All heroes mastered"
    />
  );
}
