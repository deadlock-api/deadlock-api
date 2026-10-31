import { createFileRoute, notFound } from "@tanstack/react-router";
import { Suspense } from "react";

import { findLabVariant } from "~/components/dev/lab/registry";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { findHeroBySlug } from "~/lib/hero-slug";
import { ensureCached } from "~/lib/prefetch-safe";
import { filterPlayableHeroes, heroesQueryOptions } from "~/queries/asset-queries";

export const Route = createFileRoute("/dev/lab/$variant/heroes/$heroName")({
  loader: async ({ context: { queryClient }, params }) => {
    if (!import.meta.env.DEV || !findLabVariant(params.variant)) throw notFound();
    const heroes = await ensureCached(queryClient, heroesQueryOptions);
    const hero = findHeroBySlug(filterPlayableHeroes(heroes), params.heroName);
    if (!hero) throw notFound();
    return { heroId: hero.id, heroName: hero.name, variant: params.variant };
  },
  head: () => ({ meta: [{ title: "Lab: hero" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: LabHeroRoute,
});

function LabHeroRoute() {
  const { heroId, heroName, variant } = Route.useLoaderData();
  const HeroPage = findLabVariant(variant)?.HeroPage;
  if (!HeroPage) return null;
  return (
    <Suspense fallback={<LoadingState label="design" />}>
      <HeroPage key={heroId} heroId={heroId} heroName={heroName} variant={variant} />
    </Suspense>
  );
}
