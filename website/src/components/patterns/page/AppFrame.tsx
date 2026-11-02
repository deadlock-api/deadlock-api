import { cn } from "~/lib/utils";

/** The document body of the app. `variant="bare"` is the transparent body of an embed, such as a stream overlay in OBS. */
export function AppBody({
  variant = "page",
  as: Comp = "body",
  className,
  ...props
}: React.HTMLAttributes<HTMLElement> & {
  variant?: "page" | "bare";
  /** Only for previews that show the body inside another page. */
  as?: "body" | "div";
}) {
  return (
    <Comp
      data-slot="app-body"
      data-variant={variant}
      className={cn(variant === "bare" ? "bg-transparent" : "overflow-x-hidden bg-background", className)}
      {...props}
    />
  );
}

/**
 * The page area beside the sidebar: the padding every page sits in, flat on the ground. It is a flex column, so a
 * `PageShell height="fill"` inside it can take the height that is left. Below md it also reserves the app bar at the
 * top (`SideNavDrawer`) and room at the bottom for the floating feedback button, so the first and the last rows of a
 * page can scroll clear of both.
 */
export function AppFrame({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="app-frame"
      // Positioned, so an absolute descendant (an `sr-only` label deep in a sideways scroller) is placed in the frame
      // and clipped by it, not against the document, where it widened the page.
      // `--page-height` is what a `PageShell height="viewport"` may take: the screen minus this padding and the
      // breadcrumb row (1.25rem) with its gap above the page; below md, also the app bar and the room kept for the
      // floating feedback button.
      className={cn(
        "relative flex min-h-dvh w-full min-w-0 flex-col px-4 py-4 [--page-height:calc(100dvh-4.25rem)] sm:px-8 sm:py-5 sm:[--page-height:calc(100dvh-4.75rem)]",
        "max-md:pt-[calc(var(--app-bar-height)+var(--spacing)*4)] max-md:pb-floating-clearance",
        "max-sm:[--page-height:calc(100dvh-4.25rem-var(--app-bar-height)-var(--floating-control-clearance))]",
        "sm:max-md:[--page-height:calc(100dvh-4.75rem-var(--app-bar-height)-var(--floating-control-clearance))]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
