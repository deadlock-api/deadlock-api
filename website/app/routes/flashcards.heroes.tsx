import { useQuery } from "@tanstack/react-query";
import type { HeroV2 } from "assets_deadlock_api_client/api";
import { useMemo } from "react";
import type { MetaFunction } from "react-router";

import { createPageMeta } from "~/lib/meta";
import { filterPlayableHeroes, heroesQueryOptions } from "~/queries/asset-queries";

import { FlashcardGame } from "./flashcards/components/FlashcardGame";

export const meta: MetaFunction = () => {
  return createPageMeta({
    title: "Hero Flashcards - Learn Heroes by Icon | Deadlock API",
    description: "Memorize Deadlock heroes by their icon. Multiple-choice flashcard drill with instant feedback.",
    path: "/flashcards/heroes",
  });
};

function heroIconSrc(hero: HeroV2): string {
  return hero.images?.icon_image_small_webp ?? hero.images?.icon_image_small ?? "";
}

export default function HeroFlashcards() {
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
      completionLabel="All heroes seen"
    />
  );
}
