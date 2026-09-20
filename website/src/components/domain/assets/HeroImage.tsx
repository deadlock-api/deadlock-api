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
    },
  },
  defaultVariants: { shape: "square", ring: "none" },
});

export type HeroImageVariants = VariantProps<typeof heroImageVariants>;

export type HeroSource =
  | { heroId: number; hero?: never; loading?: never }
  | { hero: SlimHero | undefined; loading?: boolean; heroId?: never };

type HeroImageLook = HeroImageVariants &
  Omit<
    React.ComponentProps<typeof AssetImage>,
    "asset" | "loading" | "skeletonClassName" | "emptyClassName" | "imgClassName"
  > & {
    className?: string;
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
  shape,
  ring,
  ringColor,
  className,
  title,
  style,
  ...props
}: HeroImageLook & { hero: SlimHero | undefined; loading?: boolean }) {
  const look = cn(heroImageVariants({ shape, ring: ringColor ? "none" : ring }), className);
  // A data color cannot be a class, and a border would eat into the art: the frame is an inset shadow.
  const ringStyle = ringColor ? { boxShadow: `inset 0 0 0 1px ${ringColor}` } : undefined;
  return (
    <AssetImage
      asset={
        hero
          ? {
              webp: hero.images?.minimap_image_webp,
              png: hero.images?.minimap_image,
              fallbackSrc: hero.images?.minimap_image_webp ?? hero.images?.minimap_image,
              alt: hero.name ?? "Unknown Hero",
              title,
            }
          : undefined
      }
      loading={loading}
      skeletonClassName={cn("aspect-square size-8 rounded-full", look)}
      emptyClassName={cn("aspect-square size-8 rounded-full bg-muted", look)}
      imgClassName={cn("aspect-square size-8", look)}
      style={ringStyle ? { ...ringStyle, ...style } : style}
      {...props}
    />
  );
}
