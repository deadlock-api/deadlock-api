import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { FlashcardGame } from "~/components/features/flashcards/FlashcardGame";
import { seo } from "~/lib/seo";
import { filterPlayableHeroes, heroesQueryOptions, type SlimHero } from "~/queries/asset-queries";

export const Route = createFileRoute("/games_/flashcards/heroes")({
  component: HeroFlashcards,
  head: () =>
    seo({
      title: "Hero Flashcards - Learn Heroes by Icon | Deadlock API",
      description: "Memorize Deadlock heroes by their icon. Multiple-choice flashcard drill with instant feedback.",
      path: "/games/flashcards/heroes",
    }),
});

function heroIconSrc(hero: SlimHero): string {
  return hero.images?.icon_image_small_webp ?? hero.images?.icon_image_small ?? "";
}

function HeroFlashcards() {
  const { data: heroes, isLoading, isError, isFetching, refetch } = useQuery(heroesQueryOptions);

  const pool = useMemo(() => {
    if (!heroes) return [];
    return filterPlayableHeroes(heroes);
  }, [heroes]);

  return (
    <FlashcardGame
      title="Hero Flashcards"
      subtitle="Identify the hero from their icon. Pick the correct name."
      pool={pool}
      renderPrompt={(entry) => (
        <img src={heroIconSrc(entry)} alt="Mystery hero" className="size-full object-contain" draggable={false} />
      )}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => void refetch()}
      retrying={isFetching}
      storageKey="flashcards:heroes:no-repeats"
      masteredLabel="All heroes mastered"
    />
  );
}
