import { cn } from "~/lib/utils";

/**
 * The document body of the app: the fixed background image and the gradient that darkens it. `variant="bare"` is
 * the transparent body of an embed, such as a stream overlay in OBS.
 */
export function AppBody({
  backgroundSrc,
  variant = "page",
  as: Comp = "body",
  className,
  style,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement> & {
  backgroundSrc?: string;
  variant?: "page" | "bare";
  /** Only for previews that show the body inside another page. */
  as?: "body" | "div";
}) {
  if (variant === "bare") {
    return (
      <Comp
        data-slot="app-body"
        data-variant="bare"
        className={cn("bg-transparent", className)}
        style={style}
        {...props}
      >
        {children}
      </Comp>
    );
  }
  return (
    <Comp
      data-slot="app-body"
      data-variant="page"
      className={cn("overflow-x-hidden bg-cover bg-fixed bg-center bg-no-repeat bg-blend-difference", className)}
      style={backgroundSrc ? { backgroundImage: `url('${backgroundSrc}')`, ...style } : style}
      {...props}
    >
      <div
        data-slot="app-body-shade"
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 bg-linear-to-br from-black/35 to-transparent"
      />
      <div data-slot="app-body-content" className="relative z-10">
        {children}
      </div>
    </Comp>
  );
}

/**
 * The decorative brand mark behind the page, tilted into the bottom corner and faded out by a mask. It is fixed to
 * the viewport by nature, like a dialog overlay; render it before the `AppFrame` so the frame blurs it.
 */
export function PageBackdrop({ src, className, ...props }: Omit<React.ComponentProps<"img">, "alt"> & { src: string }) {
  return (
    <img
      data-slot="page-backdrop"
      src={src}
      alt=""
      aria-hidden="true"
      // `page-backdrop` (effects.css) carries the tilt and the fade-out mask.
      className={cn(
        "page-backdrop pointer-events-none fixed end-0 bottom-0 size-144 opacity-10 select-none",
        className,
      )}
      {...props}
    />
  );
}

/**
 * The glass panel every page is drawn on, and the viewport-high gutter around it. The panel is a flex column, so a
 * `PageShell height="fill"` inside it can take the height that is left.
 */
export function AppFrame({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="app-frame"
      // `--page-height` is what a `PageShell height="viewport"` may take: the screen minus this gutter.
      className={cn("flex min-h-dvh w-full min-w-0 justify-center p-2 [--page-height:calc(100dvh-2rem)]", className)}
      {...props}
    >
      <div
        data-slot="app-frame-panel"
        className="relative flex w-full min-w-0 flex-col rounded-xl border border-hairline bg-background/60 p-4 shadow-xl backdrop-blur-md sm:p-6 xl:w-11/12"
      >
        {children}
      </div>
    </div>
  );
}
