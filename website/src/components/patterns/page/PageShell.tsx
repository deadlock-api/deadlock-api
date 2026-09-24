import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "~/lib/utils";

const pageShellVariants = cva("flex min-w-0 flex-col", {
  variants: {
    /** The vertical rhythm between the page's top-level blocks. */
    density: {
      data: "gap-3",
      content: "gap-6",
      marketing: "gap-12 sm:gap-16",
    },
    /** Pages are as wide as the app panel unless the content is prose or a single column of controls. */
    width: {
      full: "w-full",
      wide: "mx-auto w-full max-w-5xl",
      prose: "mx-auto w-full max-w-4xl",
      narrow: "mx-auto w-full max-w-xl",
    },
    /**
     * - `fill` takes the height the `AppFrame` has left, so a short page (not found, an error, a sign-in callback)
     *   can sit in the middle of it with `align="center"`.
     * - `viewport` is exactly one screen, for a page whose main block is a canvas or a map. `--page-height` is the
     *   screen minus the gutter of the `AppFrame`, which sets it.
     */
    // Below md, `viewport` is a floor: a phone's screen is too short for filters plus a map or chart, and a fixed
    // height let them spill out of the panel. The page grows and scrolls instead.
    height: { auto: "", fill: "flex-1", viewport: "min-h-(--page-height) md:h-(--page-height)" },
    /** `center` puts a short message in the middle of the page, with its text centred. */
    align: { start: "", center: "items-center justify-center text-center" },
  },
  defaultVariants: { density: "data", width: "full", height: "auto", align: "start" },
});

/** The outermost element of every route. It owns page width and the spacing between blocks; blocks own nothing outside themselves. */
export function PageShell({
  density,
  width,
  height = "auto",
  align,
  className,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof pageShellVariants>) {
  return (
    <div
      data-slot="page-shell"
      className={cn(pageShellVariants({ density, width, height, align }), className)}
      {...props}
    />
  );
}
