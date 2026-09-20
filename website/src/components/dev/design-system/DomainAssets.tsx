import { useQuery } from "@tanstack/react-query";

import { Specimen, Variants } from "~/components/dev/design-system/Specimen";
import { AbilityImage } from "~/components/domain/assets/AbilityImage";
import { AbilityName } from "~/components/domain/assets/AbilityName";
import { AssetImage } from "~/components/domain/assets/AssetImage";
import { BadgeImage } from "~/components/domain/assets/BadgeImage";
import { HeroImage } from "~/components/domain/assets/HeroImage";
import { HeroName } from "~/components/domain/assets/HeroName";
import { ItemImage } from "~/components/domain/assets/ItemImage";
import { ItemName } from "~/components/domain/assets/ItemName";
import { OptimizedImage } from "~/components/domain/assets/OptimizedImage";
import { heroesQueryOptions } from "~/queries/asset-queries";
import { ranksQueryOptions } from "~/queries/ranks-query";

const HERO_IDS = [1, 2, 3, 4, 6, 7];
const ITEM_IDS = [1548066885, 968099481, 2678489038];
/** Seven's three signature abilities and ultimate. */
const ABILITY_IDS = [1065103387, 1074714947, 539192269, 2061574352];
/** `tier * 10 + subtier`. */
const BADGES = [11, 36, 64, 91, 116];
const UNKNOWN_ID = 0;

export function DomainAssets() {
  const { data: heroes } = useQuery(heroesQueryOptions);
  const { data: ranks } = useQuery(ranksQueryOptions);
  const portrait = heroes?.find((hero) => hero.id === HERO_IDS[0]);

  return (
    <>
      <Specimen
        name="HeroImage and HeroName"
        source="domain/assets/HeroImage · domain/assets/HeroName"
        note="A hero anywhere outside a chart: pass the id, the component reads the cached hero list. Pass hero instead of heroId to render a hero the parent already holds, without one query subscription per row."
      >
        <Variants label="Image + name">
          {HERO_IDS.map((id) => (
            <span key={id} className="flex items-center gap-2 text-sm">
              <HeroImage heroId={id} className="size-8" />
              <HeroName heroId={id} />
            </span>
          ))}
        </Variants>
        <Variants label="Sizes (className)">
          <HeroImage heroId={HERO_IDS[1]} className="size-4" />
          <HeroImage heroId={HERO_IDS[1]} className="size-6" />
          <HeroImage heroId={HERO_IDS[1]} />
          <HeroImage heroId={HERO_IDS[1]} className="size-12" />
          <HeroImage heroId={HERO_IDS[1]} className="size-12 rounded-md border" />
        </Variants>
        <Variants label="linkToDetail, unknown id, loading">
          <HeroName heroId={HERO_IDS[2]} linkToDetail className="text-sm" />
          <span className="flex items-center gap-2 text-sm">
            <HeroImage heroId={UNKNOWN_ID} />
            <HeroName heroId={UNKNOWN_ID} />
          </span>
          <HeroImage hero={undefined} loading />
        </Variants>
      </Specimen>

      <Specimen
        name="ItemImage and ItemName"
        source="domain/assets/ItemImage · domain/assets/ItemName"
        note="A shop item by id. In tables that already hold the item list, pass item instead of itemId to skip the per-image subscription."
      >
        <Variants label="Image + name">
          {ITEM_IDS.map((id) => (
            <span key={id} className="flex items-center gap-2 text-sm">
              <ItemImage itemId={id} className="size-8" />
              <ItemName itemId={id} />
            </span>
          ))}
        </Variants>
        <Variants label="Sizes (className)">
          <ItemImage itemId={ITEM_IDS[0]} className="size-4" />
          <ItemImage itemId={ITEM_IDS[0]} className="size-6" />
          <ItemImage itemId={ITEM_IDS[0]} />
          <ItemImage itemId={ITEM_IDS[0]} className="size-12" />
        </Variants>
        <Variants label="linkToDetail, unknown id, loading">
          <ItemName itemId={ITEM_IDS[1]} linkToDetail className="text-sm" />
          <span className="flex items-center gap-2 text-sm">
            <ItemImage itemId={UNKNOWN_ID} />
            <ItemName itemId={UNKNOWN_ID} />
          </span>
          <ItemImage item={undefined} loading />
        </Variants>
      </Specimen>

      <Specimen
        name="AbilityImage and AbilityName"
        source="domain/assets/AbilityImage · domain/assets/AbilityName"
        note="A hero ability by id, in skill orders and ability analytics. The icons are single-color art, inverted to ink in the dark theme."
      >
        <Variants label="Image + name">
          {ABILITY_IDS.map((id) => (
            <span key={id} className="flex items-center gap-2 text-sm">
              <AbilityImage abilityId={id} />
              <AbilityName abilityId={id} />
            </span>
          ))}
        </Variants>
        <Variants label="Sizes (className), unknown id">
          <AbilityImage abilityId={ABILITY_IDS[0]} className="size-5" />
          <AbilityImage abilityId={ABILITY_IDS[0]} className="size-10 rounded-lg" />
          <span className="flex items-center gap-2 text-sm">
            <AbilityImage abilityId={UNKNOWN_ID} />
            <AbilityName abilityId={UNKNOWN_ID} />
          </span>
        </Variants>
      </Specimen>

      <Specimen
        name="AssetImage"
        source="domain/assets/AssetImage"
        note="The <picture> under every hero, item and ability image: webp with a png fallback, a skeleton while the asset list loads, a muted box when the asset has no art. Use it only to add another kind of asset image."
      >
        <Variants>
          <AssetImage
            asset={
              portrait && {
                webp: portrait.images?.minimap_image_webp,
                png: portrait.images?.minimap_image,
                alt: portrait.name,
              }
            }
            loading={!portrait}
            placeholderClassName="size-10 rounded-full"
            className="size-10"
          />
          <AssetImage asset={undefined} loading placeholderClassName="size-10 rounded-full" />
          <AssetImage asset={undefined} loading={false} placeholderClassName="size-10 rounded-full" />
        </Variants>
      </Specimen>

      <Specimen
        name="BadgeImage"
        source="domain/assets/BadgeImage"
        note="A rank badge (tier * 10 + subtier) from the ranks the parent already queried. An empty ranks array is the loading state; a badge the ranks do not contain falls back to a question mark."
      >
        <Variants label="Badges">
          {ranks && BADGES.map((badge) => <BadgeImage key={badge} badge={badge} ranks={ranks} className="size-10" />)}
        </Variants>
        <Variants label="Sizes (className)">
          {ranks && (
            <>
              <BadgeImage badge={64} ranks={ranks} className="size-5" />
              <BadgeImage badge={64} ranks={ranks} className="size-8" />
              <BadgeImage badge={64} ranks={ranks} className="size-12" />
            </>
          )}
        </Variants>
        <Variants label="Loading, unknown badge">
          <BadgeImage badge={64} ranks={[]} className="size-10" />
          {ranks && <BadgeImage badge={999} ranks={ranks} className="size-10" />}
        </Variants>
      </Specimen>

      <Specimen
        name="OptimizedImage"
        source="domain/assets/OptimizedImage"
        note="An image from public/ served through the site's Cloudflare image resizing as a srcSet. In dev and for SVGs it renders the original unchanged."
      >
        <Variants>
          <OptimizedImage
            src="/logo/deadchaps.png"
            alt="Deadchaps logo"
            widths={[192, 384]}
            sizes="192px"
            width={600}
            height={127}
            loading="lazy"
            className="h-auto w-48 object-contain"
          />
        </Variants>
      </Specimen>
    </>
  );
}
