import { ChevronRightIcon } from "lucide-react";
import { Slot } from "radix-ui";

import { cn } from "~/lib/utils";

/** The trail from the home page to this one. Compose: `BreadcrumbList` > `BreadcrumbItem` > link or page. */
export function Breadcrumb({ className, ...props }: React.ComponentProps<"nav">) {
  return <nav data-slot="breadcrumb" aria-label="Breadcrumb" className={cn("min-w-0", className)} {...props} />;
}

export function BreadcrumbList({ className, ...props }: React.ComponentProps<"ol">) {
  return (
    <ol
      data-slot="breadcrumb-list"
      className={cn("flex min-w-0 items-center gap-1 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export function BreadcrumbItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="breadcrumb-item"
      className={cn("flex shrink-0 items-center gap-1 last:min-w-0 last:shrink", className)}
      {...props}
    />
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
        "flex shrink-0 items-center gap-1 rounded-sm transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-3.5",
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

export function BreadcrumbSeparator({ className, children, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="breadcrumb-separator"
      role="presentation"
      aria-hidden="true"
      className={cn("shrink-0 text-muted-foreground [&>svg]:size-3", className)}
      {...props}
    >
      {children ?? <ChevronRightIcon />}
    </li>
  );
}
