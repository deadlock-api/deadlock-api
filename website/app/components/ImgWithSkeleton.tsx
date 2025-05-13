import { useState } from "react";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "../lib/utils";

export function ImgWithSkeleton(props: React.ImgHTMLAttributes<HTMLImageElement>) {
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      {!loaded && <Skeleton className={cn("size-5", props.className)} />}
      <img
        {...props}
        style={{ display: loaded ? "block" : "none", ...(props.style || {}) }}
        onLoad={() => setLoaded(true)}
        alt={props.alt}
      />
    </>
  );
}
