import { useState } from "react";

import { cn } from "~/lib/utils";

/** An image that pulses like a `Skeleton` in its own box until it has loaded or failed. */
export function ImgWithSkeleton({ className, ref, onLoad, onError, alt, ...props }: React.ComponentProps<"img">) {
  const [loaded, setLoaded] = useState(false);

  return (
    <img
      data-slot="img-with-skeleton"
      data-state={loaded ? "loaded" : "loading"}
      ref={(img) => {
        // An SSR'd or cached image can finish loading before React attaches onLoad, so
        // that event never fires — check completeness once the element is attached.
        if (img?.complete) setLoaded(true);
        if (typeof ref === "function") return ref(img);
        if (ref) ref.current = img;
      }}
      alt={alt}
      // The alt text stays hidden while loading so it cannot flash inside the pulse; a failed image shows it.
      className={cn(!loaded && "animate-pulse rounded-md bg-accent text-transparent", className)}
      onLoad={(event) => {
        setLoaded(true);
        onLoad?.(event);
      }}
      onError={(event) => {
        setLoaded(true);
        onError?.(event);
      }}
      {...props}
    />
  );
}
