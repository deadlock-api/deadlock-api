import { Link } from "@tanstack/react-router";
import { memo } from "react";

import { EntityName, type EntityNameProps } from "~/components/domain/assets/EntityName";
import type { HeroSource } from "~/components/domain/assets/HeroImage";
import { useHeroById } from "~/hooks/useAssetById";
import { heroSlug } from "~/lib/hero-slug";
import type { SlimHero } from "~/queries/asset-queries";

type HeroNameLook = Omit<EntityNameProps, "name" | "loading" | "link" | "size"> & {
  /** Links the name to the hero's analytics page. */
  linkToDetail?: boolean;
};

/** Pass `hero` to render a hero already read by the parent without another query subscription. */
export const HeroName = memo(function HeroName(props: HeroNameLook & HeroSource) {
  return props.heroId !== undefined ? <HeroNameById {...props} /> : <HeroNameView {...props} />;
});

function HeroNameById({ heroId, ...props }: HeroNameLook & { heroId: number }) {
  const { hero, isLoading } = useHeroById(heroId);
  return <HeroNameView {...props} hero={hero} loading={isLoading} />;
}

function HeroNameView({
  hero,
  linkToDetail = false,
  ...props
}: HeroNameLook & { hero: SlimHero | undefined; loading?: boolean }) {
  return (
    <EntityName
      name={hero?.name ?? "Unknown Hero"}
      size="sm"
      link={
        linkToDetail && hero ? (
          <Link to="/analytics/heroes/$heroName" params={{ heroName: heroSlug(hero.name) }} preload="intent" />
        ) : undefined
      }
      {...props}
    />
  );
}
