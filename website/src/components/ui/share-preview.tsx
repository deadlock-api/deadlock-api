import { CheckIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { FOCUS_RING } from "~/components/ui/recipes";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";

/**
 * A share image that is itself the copy button: full width at its own aspect ratio, it presses in on click and, while
 * `state` is `confirmed`, rings in the brand color with the `confirmation` over it. The parent owns the copy and the
 * state (`useCopyToClipboard` resets it on its own), so a separate copy button can confirm through the same image.
 * Until the image at `src` has loaded, a skeleton holds its space; a new `src` (a changed comparison) shows it again.
 */
export function SharePreview({
  src,
  width,
  height,
  alt = "",
  state = "idle",
  confirmation = "Link copied",
  className,
  ...props
}: Omit<React.ComponentProps<"button">, "children"> & {
  src: string;
  /** The image's pixel size, which holds its space while it loads. */
  width: number;
  height: number;
  /** Describes the image; the button is named by its `aria-label`. */
  alt?: string;
  state?: "idle" | "confirmed";
  confirmation?: string;
}) {
  const confirmed = state === "confirmed";
  const image = useRef<HTMLImageElement>(null);
  // The src that has finished loading (or failed); anything else is still on its way.
  const [settledSrc, setSettledSrc] = useState<string>();
  const loading = settledSrc !== src;
  // An image served with the page can finish before hydration attaches onLoad; it is complete by then.
  useEffect(() => {
    if (image.current?.complete) setSettledSrc(src);
  }, [src]);
  return (
    <button
      type="button"
      data-slot="share-preview"
      data-state={state}
      data-loading={loading || undefined}
      aria-busy={loading || undefined}
      className={cn(
        FOCUS_RING,
        "relative block w-full cursor-pointer overflow-hidden rounded-lg border transition-[scale,box-shadow,border-color] duration-fast ease-standard hover:border-primary/60 active:scale-98",
        confirmed && "border-primary ring-2 ring-primary",
        className,
      )}
      {...props}
    >
      <img
        ref={image}
        src={src}
        width={width}
        height={height}
        alt={alt}
        loading="lazy"
        onLoad={() => setSettledSrc(src)}
        onError={() => setSettledSrc(src)}
        className={cn("block h-auto w-full transition-opacity duration-normal", loading && "opacity-0")}
      />
      {loading && <Skeleton className="absolute inset-0 rounded-none" />}
      {confirmed && (
        <span
          aria-hidden="true"
          className="absolute inset-0 flex animate-in items-center justify-center bg-background/60 backdrop-blur-xs duration-normal fade-in-0"
        >
          <span className="flex animate-in items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg duration-normal zoom-in-75">
            <CheckIcon className="size-4" />
            {confirmation}
          </span>
        </span>
      )}
      <span className="sr-only" aria-live="polite">
        {confirmed ? confirmation : ""}
      </span>
    </button>
  );
}
