import { cva, type VariantProps } from "class-variance-authority";

import { HeroImage, type HeroImageVariants } from "~/components/domain/assets/HeroImage";
import { HeroName } from "~/components/domain/assets/HeroName";
import { cn } from "~/lib/utils";

const heroCellVariants = cva("flex min-w-0 items-center", {
  variants: { size: { sm: "gap-1.5", default: "gap-2" } },
  defaultVariants: { size: "default" },
});

const IMAGE_SIZE = { sm: "size-6", default: "size-8" } as const;

/**
 * A hero as the identity of a row: portrait and name on one line. The name truncates to the width the parent leaves
 * (cap it with a `max-w-*` on the cell); the text size is the parent's.
 */
export function HeroCell({
  heroId,
  size,
  shape,
  linkToDetail = false,
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> &
  VariantProps<typeof heroCellVariants> &
  Pick<HeroImageVariants, "shape"> & {
    heroId: number;
    /** Links the name to the hero's analytics page. */
    linkToDetail?: boolean;
  }) {
  return (
    <span
      data-slot="hero-cell"
      data-size={size ?? "default"}
      className={cn(heroCellVariants({ size }), className)}
      {...props}
    >
      {/* The name beside it already says who this is. */}
      <HeroImage heroId={heroId} shape={shape} title="" className={cn("shrink-0", IMAGE_SIZE[size ?? "default"])} />
      <HeroName heroId={heroId} linkToDetail={linkToDetail} />
    </span>
  );
}
