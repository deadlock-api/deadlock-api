import { useQuery } from "@tanstack/react-query";

import { SAMPLE_ABILITY_IDS, SAMPLE_ITEM_IDS, UNKNOWN_ID } from "~/components/dev/design-system/samples";
import { Specimen, Variants } from "~/components/dev/design-system/Specimen";
import { AbilityImage } from "~/components/domain/assets/AbilityImage";
import { AbilityName } from "~/components/domain/assets/AbilityName";
import { AssetImage } from "~/components/domain/assets/AssetImage";
import { BadgeImage } from "~/components/domain/assets/BadgeImage";
import { CorruptedItemImage } from "~/components/domain/assets/CorruptedItemImage";
import { EntityName } from "~/components/domain/assets/EntityName";
import { HeroImage } from "~/components/domain/assets/HeroImage";
import { HeroName } from "~/components/domain/assets/HeroName";
import { ItemImage } from "~/components/domain/assets/ItemImage";
import { ItemName } from "~/components/domain/assets/ItemName";
import { OptimizedImage } from "~/components/domain/assets/OptimizedImage";
import { TextLink } from "~/components/ui/text-link";
import { heroesQueryOptions } from "~/queries/asset-queries";
import { ranksQueryOptions } from "~/queries/ranks-query";

const HERO_IDS = [1, 2, 3, 4, 6, 7];
/** Ricochet, Hollow Point, Weighted Shots: tier 3 and 4 items the Broker can corrupt. */
const CORRUPTIBLE_ITEM_IDS = [2480592370, 2678489038, 3791587546];
/** `tier * 10 + subtier`. */
const BADGES = [11, 36, 64, 91, 116];

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
          {SAMPLE_ITEM_IDS.map((id) => (
            <span key={id} className="flex items-center gap-2 text-sm">
              <ItemImage itemId={id} className="size-8" />
              <ItemName itemId={id} />
            </span>
          ))}
        </Variants>
        <Variants label="Sizes (className)">
          <ItemImage itemId={SAMPLE_ITEM_IDS[0]} className="size-4" />
          <ItemImage itemId={SAMPLE_ITEM_IDS[0]} className="size-6" />
          <ItemImage itemId={SAMPLE_ITEM_IDS[0]} />
          <ItemImage itemId={SAMPLE_ITEM_IDS[0]} className="size-12" />
        </Variants>
        <Variants label="linkToDetail, unknown id, loading">
          <ItemName itemId={SAMPLE_ITEM_IDS[1]} linkToDetail className="text-sm" />
          <span className="flex items-center gap-2 text-sm">
            <ItemImage itemId={UNKNOWN_ID} />
            <ItemName itemId={UNKNOWN_ID} />
          </span>
          <ItemImage item={undefined} loading />
        </Variants>
      </Specimen>

      <Specimen
        name="CorruptedItemImage"
        source="domain/assets/CorruptedItemImage"
        note="The corrupted version of a tier 3 or 4 item: its shop icon inside the Broker's frame, which is the game's own art and the same in every theme. The icon’s alt text is “Corrupted <item>” (ItemImage takes an `alt`); the frame is decorative. Before the frame art loads the plain icon holds the same box."
      >
        <Variants label="Sizes (className): size-6, default (size-8), size-12, size-16">
          <CorruptedItemImage itemId={CORRUPTIBLE_ITEM_IDS[0]} className="size-6" />
          <CorruptedItemImage itemId={CORRUPTIBLE_ITEM_IDS[0]} />
          <CorruptedItemImage itemId={CORRUPTIBLE_ITEM_IDS[1]} className="size-12" />
          <CorruptedItemImage itemId={CORRUPTIBLE_ITEM_IDS[2]} className="size-16" />
        </Variants>
        <Variants label="frame: frame, active · unknown id, loading">
          <CorruptedItemImage itemId={CORRUPTIBLE_ITEM_IDS[1]} className="size-12" />
          <CorruptedItemImage itemId={CORRUPTIBLE_ITEM_IDS[1]} frame="active" className="size-12" />
          <CorruptedItemImage itemId={UNKNOWN_ID} className="size-12" />
          <CorruptedItemImage item={undefined} loading className="size-12" />
        </Variants>
      </Specimen>

      <Specimen
        name="AbilityImage and AbilityName"
        source="domain/assets/AbilityImage · domain/assets/AbilityName"
        note="A hero ability by id, in skill orders and ability analytics. The icons are single-color art, inverted to ink in the dark theme."
      >
        <Variants label="Image + name">
          {SAMPLE_ABILITY_IDS.map((id) => (
            <span key={id} className="flex items-center gap-2 text-sm">
              <AbilityImage abilityId={id} />
              <AbilityName abilityId={id} />
            </span>
          ))}
        </Variants>
        <Variants label="Sizes (className), unknown id">
          <AbilityImage abilityId={SAMPLE_ABILITY_IDS[0]} className="size-5" />
          <AbilityImage abilityId={SAMPLE_ABILITY_IDS[0]} className="size-10 rounded-lg" />
          <span className="flex items-center gap-2 text-sm">
            <AbilityImage abilityId={UNKNOWN_ID} />
            <AbilityName abilityId={UNKNOWN_ID} />
          </span>
        </Variants>
      </Specimen>

      <Specimen
        name="EntityName"
        source="domain/assets/EntityName"
        note="The truncating line under HeroName, ItemName and AbilityName: text, a link when `link` is given, a skeleton while loading. Use it only to add another kind of asset name."
      >
        <Variants label="text, link, loading (sm, default), truncated">
          <EntityName name="Abrams" className="text-sm" />
          <EntityName name="Abrams" link={<TextLink href="#EntityName" />} className="text-sm" />
          <EntityName name="" loading />
          <EntityName name="" loading size="default" />
          <span className="flex w-24 text-sm">
            <EntityName name="A name too long for its cell" />
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
