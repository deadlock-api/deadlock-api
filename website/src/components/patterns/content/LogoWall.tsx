import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { FOCUS_RING } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

const logoWallItemVariants = cva([FOCUS_RING, "rounded-sm"], {
  variants: {
    /**
     * `logo`: a sponsor's wordmark, dimmed until hovered or focused so the wall does not outshout the page. `icon`: a
     * site's square icon in a grid of icons, some of them unlinked, so it is never dimmed.
     */
    size: {
      logo: "opacity-70 transition-opacity duration-fast ease-standard hover:opacity-100 focus-visible:opacity-100",
      icon: "flex",
    },
  },
  defaultVariants: { size: "logo" },
});

/** One logo, as a link. The child is the image. */
export function LogoWallItem({
  asChild = false,
  size = "logo",
  className,
  ...props
}: React.ComponentProps<"a"> & VariantProps<typeof logoWallItemVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "a";
  return (
    <Comp
      data-slot="logo-wall-item"
      data-size={size}
      className={cn(logoWallItemVariants({ size }), className)}
      {...props}
    />
  );
}
