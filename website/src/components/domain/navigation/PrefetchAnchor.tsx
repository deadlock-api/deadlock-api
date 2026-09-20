import { type ComponentProps, useCallback } from "react";

const prefetched = new Set<string>();

function prefetch(href: string) {
  if (typeof document === "undefined") return;
  if (prefetched.has(href)) return;
  prefetched.add(href);
  const link = document.createElement("link");
  link.rel = "prefetch";
  link.as = "document";
  link.href = href;
  document.head.appendChild(link);
}

interface PrefetchAnchorProps extends ComponentProps<"a"> {
  href: string;
}

export function PrefetchAnchor({ href, children, onMouseEnter, onFocus, ...rest }: PrefetchAnchorProps) {
  const handleMouseEnter = useCallback<NonNullable<typeof onMouseEnter>>(
    (e) => {
      prefetch(href);
      onMouseEnter?.(e);
    },
    [href, onMouseEnter],
  );

  const handleFocus = useCallback<NonNullable<typeof onFocus>>(
    (e) => {
      prefetch(href);
      onFocus?.(e);
    },
    [href, onFocus],
  );

  return (
    <a data-slot="prefetch-anchor" href={href} onMouseEnter={handleMouseEnter} onFocus={handleFocus} {...rest}>
      {children}
    </a>
  );
}
