import { AssetImage } from "~/components/domain/assets/AssetImage";
import { useAbilityById } from "~/hooks/useAssetById";
import { cn } from "~/lib/utils";

export function AbilityImage({
  abilityId,
  className,
  title,
  ...props
}: Omit<React.ComponentProps<typeof AssetImage>, "asset" | "loading" | "title" | "placeholderClassName"> & {
  abilityId: number;
  /** Native hover title, the name by default; pass "" where a tooltip already names the image. */
  title?: string;
}) {
  const { ability, isLoading } = useAbilityById(abilityId);

  return (
    <AssetImage
      asset={
        ability
          ? {
              webp: ability.image_webp,
              png: ability.image,
              fallbackSrc: ability.image_webp ?? ability.image,
              alt: ability.name ?? "Unknown Ability",
              title,
            }
          : undefined
      }
      {...props}
      loading={isLoading}
      placeholderClassName={cn("aspect-square size-8 rounded-full", className)}
      // Ability art ships as a dark glyph on transparency; the theme draws it in ink, so it is always inverted.
      className={cn("aspect-square size-8 object-cover glyph-ink", className)}
    />
  );
}
