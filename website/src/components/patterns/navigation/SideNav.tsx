import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { useCallback } from "react";

import { assignRef } from "~/components/ui/hooks/assign-ref";
import { FOCUS_RING } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

/**
 * Scrolls a list that overflows until its active item is on screen, on mount and whenever the active item changes.
 * The last groups sat below the fold of a 900px screen, so a page there opened with its own entry out of sight.
 */
function keepActiveItemInView(list: HTMLElement): () => void {
  const reveal = () => {
    const item = list.querySelector<HTMLElement>("[data-slot=side-nav-item][data-active]");
    if (!item || list.scrollHeight <= list.clientHeight) return;
    const box = list.getBoundingClientRect();
    const itemBox = item.getBoundingClientRect();
    if (itemBox.top < box.top) list.scrollTop -= box.top - itemBox.top + itemBox.height;
    else if (itemBox.bottom > box.bottom) list.scrollTop += itemBox.bottom - box.bottom + itemBox.height;
  };
  const observer = new MutationObserver(reveal);
  observer.observe(list, { subtree: true, attributes: true, attributeFilter: ["data-active"] });
  // A drawer mounts its list before it has a size; the first layout it gets is when the reveal can measure.
  const resize = new ResizeObserver(reveal);
  resize.observe(list);
  return () => {
    observer.disconnect();
    resize.disconnect();
  };
}

/**
 * A vertical list of links: the app's main navigation, or the index of a long page. When it scrolls, the active item
 * is kept in view, and an edge with more links past it fades out (`scroll-fade-y`), so a list cut off at a group
 * boundary does not look finished.
 */
export function SideNav({ className, ref, ...props }: React.ComponentProps<"nav">) {
  const composedRef = useCallback(
    (node: HTMLElement | null) => {
      assignRef(ref, node);
      if (!node) return;
      const stop = keepActiveItemInView(node);
      return () => {
        stop();
        assignRef(ref, null);
      };
    },
    [ref],
  );
  return (
    <nav
      ref={composedRef}
      data-slot="side-nav"
      className={cn("flex scroll-fade-y flex-col gap-4", className)}
      {...props}
    />
  );
}

export function SideNavGroup({
  label,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & { label?: React.ReactNode }) {
  return (
    <div data-slot="side-nav-group" className={cn("flex flex-col gap-0.5", className)} {...props}>
      {label && (
        <p data-slot="side-nav-group-label" className="px-3 pb-1 eyebrow">
          {label}
        </p>
      )}
      {children}
    </div>
  );
}

const sideNavItemVariants = cva(
  [
    "flex min-w-0 items-center gap-2.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-fast ease-standard",
    FOCUS_RING,
    "focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar [&_svg]:size-4 [&_svg]:shrink-0",
    // The page you are on is a solid brand-red item: the one mark of "current" the whole site shares.
    "data-active:bg-primary data-active:font-semibold data-active:text-primary-foreground data-active:[&_svg]:text-primary-foreground",
  ],
  {
    variants: {
      variant: {
        default: [
          "text-secondary-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground [&_svg]:text-muted-foreground",
        ],
        /** One entry the navigation wants noticed, such as the paid feature: brand-red text until it is current. */
        highlight: ["text-primary hover:bg-sidebar-accent [&_svg]:text-primary"],
      },
    },
    defaultVariants: { variant: "default" },
  },
);

/** One destination. Pass the link through `asChild`; `active` marks the current one and sets `aria-current`. */
export function SideNavItem({
  active = false,
  variant,
  asChild = false,
  className,
  ...props
}: React.ComponentProps<"a"> & VariantProps<typeof sideNavItemVariants> & { active?: boolean; asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "a";
  return (
    <Comp
      data-slot="side-nav-item"
      data-active={active || undefined}
      aria-current={active ? "page" : undefined}
      className={cn(sideNavItemVariants({ variant }), className)}
      {...props}
    />
  );
}

/** A bordered strip under the links: calls to action, legal links, social icons. */
export function SideNavFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="side-nav-footer" className={cn("border-t border-sidebar-border px-3 py-2", className)} {...props} />
  );
}
