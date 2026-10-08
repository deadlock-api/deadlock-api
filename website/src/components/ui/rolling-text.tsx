import { Children, useEffect, useState } from "react";

import { cn } from "~/lib/utils";

interface RollingTextProps extends React.ComponentProps<"span"> {
  /** How long each item shows, in milliseconds. */
  interval?: number;
}

/**
 * Cycles through its children, one at a time, each new one rolling up into place as the last rolls out above: the
 * examples in a search field's placeholder. Each child is one item. Decorative, so hidden from assistive technology;
 * the field names itself. With reduced motion it stays on the first item.
 */
export function RollingText({ interval = 3500, className, children, ...props }: RollingTextProps) {
  const items = Children.toArray(children);
  const count = items.length;
  const [{ index, previous }, setRoll] = useState<{ index: number; previous: number | null }>({
    index: 0,
    previous: null,
  });

  useEffect(() => {
    if (count < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const id = window.setInterval(
      () => setRoll((roll) => ({ index: (roll.index + 1) % count, previous: roll.index })),
      interval,
    );
    return () => window.clearInterval(id);
  }, [count, interval]);

  return (
    <span
      data-slot="rolling-text"
      aria-hidden="true"
      // One grid cell for the leaving and the arriving item, so they roll past each other in the same place.
      className={cn("inline-grid overflow-hidden align-bottom", className)}
      {...props}
    >
      {previous !== null && (
        <span
          key={`out-${previous}-${index}`}
          className="col-start-1 row-start-1 animate-out duration-slow fill-mode-forwards fade-out slide-out-to-top"
          onAnimationEnd={() => setRoll((roll) => ({ ...roll, previous: null }))}
        >
          {items[previous]}
        </span>
      )}
      <span
        key={`in-${index}`}
        className={cn(
          "col-start-1 row-start-1",
          previous !== null && "animate-in duration-slow fade-in slide-in-from-bottom",
        )}
      >
        {items[index % Math.max(count, 1)]}
      </span>
    </span>
  );
}
