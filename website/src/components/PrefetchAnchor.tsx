import { type AnchorHTMLAttributes, type ReactNode, useCallback } from "react";

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

interface PrefetchAnchorProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  to: string;
  children: ReactNode;
}

export function PrefetchAnchor({ to, children, onMouseEnter, onFocus, ...rest }: PrefetchAnchorProps) {
  const handleMouseEnter = useCallback<NonNullable<typeof onMouseEnter>>(
    (e) => {
      prefetch(to);
      onMouseEnter?.(e);
    },
    [to, onMouseEnter],
  );

  const handleFocus = useCallback<NonNullable<typeof onFocus>>(
    (e) => {
      prefetch(to);
      onFocus?.(e);
    },
    [to, onFocus],
  );

  return (
    <a href={to} onMouseEnter={handleMouseEnter} onFocus={handleFocus} {...rest}>
      {children}
    </a>
  );
}
