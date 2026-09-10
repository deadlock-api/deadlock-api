import { AssetImage } from "~/components/AssetImage";
import { useAbilityById } from "~/hooks/useAssetById";
import { cn } from "~/lib/utils";

export function AbilityImage({
  abilityId,
  className,
  title,
}: {
  abilityId: number;
  className?: string;
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
      isLoading={isLoading}
      skeletonClassName={cn("aspect-square size-8 rounded-full", className)}
      emptyClassName={cn("aspect-square size-8 rounded-full bg-muted", className)}
      imgClassName={cn("aspect-square size-8 object-cover dark:brightness-0 dark:invert", className)}
    />
  );
}
