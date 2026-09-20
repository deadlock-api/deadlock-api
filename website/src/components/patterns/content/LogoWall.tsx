import { Slot } from "radix-ui";

import { FOCUS_RING } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

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
        FOCUS_RING,
        "rounded-sm opacity-70 transition-opacity duration-fast ease-standard hover:opacity-100 focus-visible:opacity-100",
        className,
      )}
      {...props}
    />
  );
}
