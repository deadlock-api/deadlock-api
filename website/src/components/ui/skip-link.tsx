import { FOCUS_RING } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

/**
 * The first stop for keyboard users: hidden until focused, it jumps past the navigation to the page content (WCAG
 * 2.4.1). The target needs no `tabIndex`; following the link moves the sequential focus start point to it.
 */
export function SkipLink({
  href = "#main-content",
  children = "Skip to content",
  className,
  ...props
}: React.ComponentProps<"a">) {
  return (
    <a
      data-slot="skip-link"
      href={href}
      className={cn(
        FOCUS_RING,
        "sr-only rounded-md bg-primary text-sm font-medium text-primary-foreground shadow-lg",
        // `not-sr-only` also clears the padding, so it is set again for the focused state.
        "focus-visible:not-sr-only focus-visible:fixed focus-visible:start-2 focus-visible:top-2 focus-visible:z-50 focus-visible:px-3 focus-visible:py-2",
        className,
      )}
      {...props}
    >
      {children}
    </a>
  );
}
