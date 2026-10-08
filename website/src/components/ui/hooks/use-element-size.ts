import { type RefObject, useLayoutEffect, useState } from "react";

export interface ElementSize {
  width: number;
  height: number;
}

const UNMEASURED: ElementSize = { width: 0, height: 0 };

type Box = "content" | "border";

/**
 * The element's layout size, before transforms: a dialog zooming in still measures at its full size. The content box
 * leaves out padding, border and scrollbar, as a ResizeObserver's `contentBoxSize` does.
 */
function measure(element: Element, box: Box): ElementSize {
  if (!(element instanceof HTMLElement)) {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }
  if (box === "border") return { width: element.offsetWidth, height: element.offsetHeight };
  const style = getComputedStyle(element);
  const px = (value: string) => Number.parseFloat(value) || 0;
  return {
    width: element.clientWidth - px(style.paddingLeft) - px(style.paddingRight),
    height: element.clientHeight - px(style.paddingTop) - px(style.paddingBottom),
  };
}

/**
 * The size of an element, kept current by a ResizeObserver: for layouts computed from the room a container has
 * rather than from the viewport. `target` is a ref, or the element itself (from a callback ref held in state) when it
 * mounts later than the component. The server render and the first client render use `initial`, so they agree; the
 * first measurement is taken in a layout effect, before the browser paints, so the initial layout never shows.
 *
 * `round` rounds to whole pixels, so a layout computed from the size does not re-run for every fraction of a resize.
 * `box` picks the content box (default) or the border box (`"border"`). While `enabled` is false the last size is
 * kept and nothing is observed.
 */
export function useElementSize<T extends Element>(
  target: RefObject<T | null> | T | null,
  {
    round = false,
    box = "content",
    enabled = true,
    initial = UNMEASURED,
  }: { round?: boolean; box?: Box; enabled?: boolean; initial?: ElementSize } = {},
): ElementSize {
  const [size, setSize] = useState(initial);

  useLayoutEffect(() => {
    const element = target && "current" in target ? target.current : target;
    if (!enabled || !element) return;
    const update = (width: number, height: number) => {
      const next = round ? { width: Math.round(width), height: Math.round(height) } : { width, height };
      setSize((current) => (current.width === next.width && current.height === next.height ? current : next));
    };
    const first = measure(element, box);
    update(first.width, first.height);
    const observer = new ResizeObserver(([entry]) => {
      const measured = box === "border" ? entry.borderBoxSize[0] : entry.contentBoxSize[0];
      update(measured.inlineSize, measured.blockSize);
    });
    observer.observe(element, { box: box === "border" ? "border-box" : "content-box" });
    return () => observer.disconnect();
  }, [target, round, box, enabled]);

  return size;
}
