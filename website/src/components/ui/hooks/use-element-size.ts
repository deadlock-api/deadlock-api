import { type RefObject, useEffect, useState } from "react";

export interface ElementSize {
  width: number;
  height: number;
}

const UNMEASURED: ElementSize = { width: 0, height: 0 };

/**
 * The size of an element, kept current by a ResizeObserver: for layouts computed from the room a container has
 * rather than from the viewport. `target` is a ref, or the element itself (from a callback ref held in state) when it
 * mounts later than the component. The size is `initial` until the first measurement, which comes after hydration, so
 * the server and the first client render agree.
 *
 * `round` rounds to whole pixels, so a layout computed from the size does not re-run for every fraction of a resize.
 * `box` picks the content box (default) or the border box (`"border"`). While `enabled` is false the last size is kept and nothing
 * is observed.
 */
export function useElementSize<T extends Element>(
  target: RefObject<T | null> | T | null,
  {
    round = false,
    box = "content",
    enabled = true,
    initial = UNMEASURED,
  }: { round?: boolean; box?: "content" | "border"; enabled?: boolean; initial?: ElementSize } = {},
): ElementSize {
  const [size, setSize] = useState(initial);

  useEffect(() => {
    const element = target && "current" in target ? target.current : target;
    if (!enabled || !element) return;
    const observer = new ResizeObserver(([entry]) => {
      const measured = box === "border" ? entry.borderBoxSize[0] : entry.contentBoxSize[0];
      const width = round ? Math.round(measured.inlineSize) : measured.inlineSize;
      const height = round ? Math.round(measured.blockSize) : measured.blockSize;
      setSize((current) => (current.width === width && current.height === height ? current : { width, height }));
    });
    observer.observe(element, { box: box === "border" ? "border-box" : "content-box" });
    return () => observer.disconnect();
  }, [target, round, box, enabled]);

  return size;
}
