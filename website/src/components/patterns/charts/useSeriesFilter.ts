import { useState } from "react";

/**
 * Which series of a chart the reader picked to show, for a `ChartLegendToggle` per series: pressing an item selects
 * it and pressing more adds them, so the chart shows only the selected ones; pressing a selected item drops it. With
 * nothing selected every series shows, so the chart starts complete and the last press back restores it.
 */
export function useSeriesFilter<T extends string>() {
  const [selected, setSelected] = useState<ReadonlySet<T>>(() => new Set());
  return {
    selected,
    /** Whether the series `id` is drawn. */
    shown: (id: T) => selected.size === 0 || selected.has(id),
    /** Spread onto the `ChartLegendToggle` of the series `id`. */
    toggleProps: (id: T) => ({
      pressed: selected.has(id),
      onPressedChange: (pressed: boolean) =>
        setSelected((current) => {
          const next = new Set(current);
          if (pressed) next.add(id);
          else next.delete(id);
          return next;
        }),
    }),
  };
}
