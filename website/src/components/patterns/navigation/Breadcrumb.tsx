import { ChevronRightIcon } from "lucide-react";
import { Slot } from "radix-ui";

import { FOCUS_RING } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

/** The trail from the home page to this one. Compose: `BreadcrumbItem` > `BreadcrumbLink` or `BreadcrumbPage`. */
export function Breadcrumb({ className, children, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav data-slot="breadcrumb" aria-label="Breadcrumb" className={cn("min-w-0", className)} {...props}>
      <ol data-slot="breadcrumb-list" className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
        {children}
      </ol>
    </nav>
  );
}

/** One entry of the trail. Every entry but the first draws the separator before itself. */
export function BreadcrumbItem({ className, children, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="breadcrumb-item"
      className={cn("group/breadcrumb-item flex shrink-0 items-center gap-1 last:min-w-0 last:shrink", className)}
      {...props}
    >
      <ChevronRightIcon
        data-slot="breadcrumb-separator"
        aria-hidden="true"
        className="size-3 shrink-0 group-first/breadcrumb-item:hidden"
      />
      {children}
    </li>
  );
}

/** An ancestor page. Pass the router link through `asChild`; an icon-only link needs an `aria-label`. */
export function BreadcrumbLink({
  asChild = false,
  className,
  ...props
}: React.ComponentProps<"a"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "a";
  return (
    <Comp
      data-slot="breadcrumb-link"
      className={cn(
        FOCUS_RING,
        // The 14px home icon and the 20px line are under 24px; the pseudo-element extends the hit area without
        // moving the trail.
        "relative flex shrink-0 items-center gap-1 rounded-sm transition-colors after:absolute after:-inset-1.25 hover:text-foreground [&_svg]:size-3.5",
        className,
      )}
      {...props}
    />
  );
}

/** The page the reader is on: the last entry, not a link, and the one that truncates when the trail is too long. */
export function BreadcrumbPage({ className, children, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="breadcrumb-page"
      aria-current="page"
      title={typeof children === "string" ? children : undefined}
      className={cn("truncate font-medium text-foreground", className)}
      {...props}
    >
      {children}
    </span>
  );
}
