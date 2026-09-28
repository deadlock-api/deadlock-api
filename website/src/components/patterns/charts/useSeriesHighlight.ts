import { useState } from "react";

/**
 * Which series of a chart the reader singled out, for a `ChartLegendToggle` per series: hovering or focusing an item
 * highlights its series for as long as it lasts, pressing one pins it. The passing highlight wins over the pinned one,
 * so the reader can glance at another series and come back.
 */
export function useSeriesHighlight() {
  const [pinned, setPinned] = useState<string | null>(null);
  const [passing, setPassing] = useState<string | null>(null);
  return {
    /** The series to draw highlighted, or null for none. */
    highlighted: passing ?? pinned,
    pinned,
    /** Spread onto the `ChartLegendToggle` of the series `id`. */
    toggleProps: (id: string) => ({
      pressed: pinned === id,
      onPressedChange: (pressed: boolean) => setPinned(pressed ? id : null),
      onHighlight: (on: boolean) => setPassing((current) => (on ? id : current === id ? null : current)),
    }),
  };
}
