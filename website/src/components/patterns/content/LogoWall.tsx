import { Slot } from "radix-ui";

import { cn } from "~/lib/utils";

/** A wrapping, centred row of partner or sponsor logos. */
export function LogoWall({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="logo-wall"
      className={cn("flex flex-wrap items-center justify-center gap-8", className)}
      {...props}
    />
  );
}

/** One logo, as a link: dimmed until hovered or focused, so the wall does not outshout the page. The child is the image. */
export function LogoWallItem({
  asChild = false,
  className,
  ...props
}: React.ComponentProps<"a"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "a";
  return (
    <Comp
      data-slot="logo-wall-item"
      className={cn(
        "rounded-sm opacity-70 transition-opacity duration-fast ease-standard outline-none hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
      {...props}
    />
  );
}
