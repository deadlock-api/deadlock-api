import { useEffect, useState } from "react";

/** Recharts places y tick text this far from the plot: its tick size (6) plus tick margin (2). */
const TICK_GAP_PX = 8;
const TICK_TEXT = ".recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value";

/**
 * One y-axis width for plots stacked on a shared x-axis, so their plot areas line up: the widest tick label among
 * them, measured in the page. Put `ref` on an element around the plots and pass `width` to each `<YAxis>`, after
 * `CHART_Y_AXIS`. Until the labels are measured the axes size themselves.
 */
export function useSharedAxisWidth<T extends HTMLElement>() {
  // A callback ref into state, so the effect reruns when the element mounts.
  const [root, ref] = useState<T | null>(null);
  const [width, setWidth] = useState<number | "auto">("auto");

  // Recharts draws the ticks after the chart has measured its container, and redraws them when the data changes,
  // so the measurement follows the DOM rather than a render of this component.
  useEffect(() => {
    if (!root) return;
    const measure = () => {
      const labels = Array.from(root.querySelectorAll(TICK_TEXT), (tick) => tick.getBoundingClientRect().width);
      if (labels.length === 0) return;
      const next = Math.ceil(Math.max(...labels)) + TICK_GAP_PX;
      setWidth((current) => (current === next ? current : next));
    };
    measure();
    const observer = new MutationObserver(measure);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [root]);

  return { ref, width };
}
