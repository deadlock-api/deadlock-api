import { cva, type VariantProps } from "class-variance-authority";

import { AssetImage } from "~/components/domain/assets/AssetImage";
import { useHeroById } from "~/hooks/useAssetById";
import { cn } from "~/lib/utils";
import type { SlimHero } from "~/queries/asset-queries";

const heroImageVariants = cva("", {
  variants: {
    /** The art is a transparent PNG: `circle` hides its corners on any surface, `rounded` frames it like an item. */
    shape: { square: "", rounded: "rounded-md", circle: "rounded-full object-cover" },
    /** A thin frame; a tone marks a side (ally, enemy) or a result. */
    ring: {
      none: "",
      border: "border border-border/50",
      primary: "border border-primary/50",
      positive: "border border-positive/50",
      negative: "border border-negative/50",
      /** The drop target under a dragged portrait. */
      target: "ring-1 ring-foreground ring-inset",
    },
  },
  defaultVariants: { shape: "square", ring: "none" },
});

export type HeroImageVariants = VariantProps<typeof heroImageVariants>;

export type HeroSource =
  | { heroId: number; hero?: never; loading?: never }
  | { hero: SlimHero | undefined; loading?: boolean; heroId?: never };

type HeroImageLook = HeroImageVariants &
  Omit<React.ComponentProps<typeof AssetImage>, "asset" | "loading" | "placeholderClassName"> & {
    /**
     * `icon` is the round head of the minimap, for rows and chips. `portrait` is the tall hero-card art (3:4), for the
     * header of a page about the hero; it falls back to the icon where a hero has no card.
     */
    art?: "icon" | "portrait";
    /** A CSS color for the frame when it comes from data (a lane, the hero's own color). Replaces `ring`. */
    ringColor?: string;
    /** Native hover title, the name by default; pass "" where a tooltip already names the image. */
    title?: string;
  };

/** Pass `hero` to render a hero already read by the parent without another query subscription. */
export function HeroImage(props: HeroImageLook & HeroSource) {
  return props.heroId !== undefined ? <HeroImageById {...props} /> : <HeroImageView {...props} />;
}

function HeroImageById({ heroId, ...props }: HeroImageLook & { heroId: number }) {
  const { hero, isLoading } = useHeroById(heroId);

  return <HeroImageView {...props} hero={hero} loading={isLoading} />;
}

function HeroImageView({
  hero,
  loading,
  art = "icon",
  shape,
  ring,
  ringColor,
  className,
  title,
  style,
  ...props
}: HeroImageLook & { hero: SlimHero | undefined; loading?: boolean }) {
  const look = cn(heroImageVariants({ shape, ring: ringColor ? "none" : ring }), className);
  const images = hero?.images;
  const portrait = art === "portrait" && (images?.icon_hero_card_webp || images?.icon_hero_card);
  const webp = portrait ? images?.icon_hero_card_webp : images?.minimap_image_webp;
  const png = portrait ? images?.icon_hero_card : images?.minimap_image;
  const frame = portrait ? "aspect-3/4 w-24 object-cover object-top" : "aspect-square size-8";
  // A data color cannot be a class, and a border would eat into the art: the frame is an inset shadow.
  const ringStyle = ringColor ? { boxShadow: `inset 0 0 0 1px ${ringColor}` } : undefined;
  return (
    <AssetImage
      asset={
        hero
          ? {
              webp,
              png,
              fallbackSrc: webp ?? png,
              alt: hero.name ?? "Unknown Hero",
              title,
            }
          : undefined
      }
      {...props}
      loading={loading}
      placeholderClassName={cn(frame, !portrait && "rounded-full", look)}
      className={cn(frame, look)}
      style={ringStyle ? { ...ringStyle, ...style } : style}
    />
  );
}
