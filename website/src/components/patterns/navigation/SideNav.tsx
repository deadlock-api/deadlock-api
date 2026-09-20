import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { FOCUS_RING } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

/** A vertical list of links: the app's main navigation, or the index of a long page. */
export function SideNav({ className, ...props }: React.ComponentProps<"nav">) {
  return <nav data-slot="side-nav" className={cn("flex flex-col gap-4", className)} {...props} />;
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
        <p data-slot="side-nav-group-label" className="px-3 pb-1 eyebrow text-xs">
          {label}
        </p>
      )}
      {children}
    </div>
  );
}

const sideNavItemVariants = cva(
  [
    "flex min-w-0 items-center gap-2.5 rounded-md border-s-2 px-3 py-1.5 text-sm font-medium transition-colors duration-fast ease-standard",
    FOCUS_RING,
    "[&_svg]:size-4 [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        default: [
          "border-transparent text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground [&_svg]:text-muted-foreground",
          "data-active:border-primary data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground data-active:[&_svg]:text-primary",
        ],
        /** One entry the navigation wants noticed, such as the paid feature. */
        highlight: [
          "border border-primary/30 bg-primary/10 text-primary hover:bg-primary/15",
          "data-active:border-primary/60 data-active:bg-primary/15",
        ],
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
