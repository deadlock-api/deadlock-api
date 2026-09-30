import { useState } from "react";

import { useLoadedImageRef } from "~/components/ui/hooks/use-loaded-image-ref";
import { cn } from "~/lib/utils";

/** An image that pulses like a `Skeleton` in its own box until it has loaded or failed. */
export function ImgWithSkeleton({ className, ref, onLoad, onError, alt, ...props }: React.ComponentProps<"img">) {
  const [loaded, setLoaded] = useState(false);
  const imgRef = useLoadedImageRef(ref, () => setLoaded(true));

  return (
    <img
      data-slot="img-with-skeleton"
      data-state={loaded ? "loaded" : "loading"}
      ref={imgRef}
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
