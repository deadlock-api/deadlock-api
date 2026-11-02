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
    /** `full`: a logo shown in its own colors at rest, where the sponsors are a page's subject (the home page). */
    emphasis: { dim: "", full: "opacity-100" },
  },
  defaultVariants: { size: "logo", emphasis: "dim" },
});

/** One logo, as a link. The child is the image; a link to a new tab says so to a screen reader. */
export function LogoWallItem({
  asChild = false,
  size = "logo",
  emphasis,
  className,
  children,
  ...props
}: React.ComponentProps<"a"> & VariantProps<typeof logoWallItemVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "a";
  return (
    <Comp
      data-slot="logo-wall-item"
      data-size={size}
      className={cn(logoWallItemVariants({ size, emphasis }), className)}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {children}
          {props.target === "_blank" && <span className="sr-only"> (opens in a new tab)</span>}
        </>
      )}
    </Comp>
  );
}

const logoWallVariants = cva("grid", {
  variants: {
    /**
     * `icons`: square site icons in equal cells as many a row as fit, so a long wall lines up. `row`: up to three
     * wordmarks on one row that share it equally, shrinking in a narrow container rather than wrapping 2 + 1.
     */
    layout: {
      icons: "grid-cols-[repeat(auto-fill,minmax(2rem,1fr))] justify-items-center gap-1.5",
      row: "grid-cols-3 items-center justify-items-center gap-4",
    },
  },
  defaultVariants: { layout: "icons" },
});

/** A list of logos: its children are `<li>`s, each holding a `LogoWallItem` (or an unlinked image). */
export function LogoWall({
  layout,
  className,
  ...props
}: React.ComponentProps<"ul"> & VariantProps<typeof logoWallVariants>) {
  return (
    <ul
      data-slot="logo-wall"
      data-layout={layout ?? "icons"}
      className={cn(logoWallVariants({ layout }), className)}
      {...props}
    />
  );
}
