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
  /** `rolling` while the item before `index` is still leaving. */
  const [{ index, rolling }, setRoll] = useState({ index: 0, rolling: false });
  const previous = (index - 1 + count) % Math.max(count, 1);

  useEffect(() => {
    if (count < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const id = window.setInterval(
      () => setRoll((roll) => ({ index: (roll.index + 1) % count, rolling: true })),
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
      {rolling && (
        <span
          key={`out-${index}`}
          className="col-start-1 row-start-1 animate-out duration-slow fill-mode-forwards fade-out slide-out-to-top"
          onAnimationEnd={() => setRoll((roll) => ({ ...roll, rolling: false }))}
        >
          {items[previous]}
        </span>
      )}
      <span
        key={`in-${index}`}
        className={cn("col-start-1 row-start-1", rolling && "animate-in duration-slow fade-in slide-in-from-bottom")}
      >
        {items[index]}
      </span>
    </span>
  );
}
