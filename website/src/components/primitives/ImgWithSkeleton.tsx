import { useCallback, useState } from "react";

import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";

export function ImgWithSkeleton(props: React.ImgHTMLAttributes<HTMLImageElement>) {
  const [loaded, setLoaded] = useState(false);

  // An SSR'd or cached image can finish loading before React attaches onLoad, so
  // that event never fires — check completeness once the element is attached.
  const ref = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete) setLoaded(true);
  }, []);

  return (
    <>
      {!loaded && <Skeleton className={cn("size-5", props.className)} />}
      <img
        {...props}
        ref={ref}
        style={{ display: loaded ? "block" : "none", ...(props.style || {}) }}
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
        alt={props.alt}
      />
    </>
  );
}
