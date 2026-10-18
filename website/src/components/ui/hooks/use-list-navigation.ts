/** The keys that move through a vertical list, and how far: a step, a page, or to an end. */
export function nextListIndex(key: string, index: number, count: number, pageSize = 10): number | null {
  if (count === 0) return null;
  const last = count - 1;
  // With nothing selected yet, any key starts at the edge it points to.
  const from = index < 0 ? (key === "ArrowUp" || key === "End" || key === "PageUp" ? count : -1) : index;
  switch (key) {
    case "ArrowDown":
      return Math.min(last, from + 1);
    case "ArrowUp":
      return Math.max(0, from - 1);
    case "PageDown":
      return Math.min(last, from + pageSize);
    case "PageUp":
      return Math.max(0, from - pageSize);
    case "Home":
      return 0;
    case "End":
      return last;
    default:
      return null;
  }
}

/**
 * Headless keyboard selection for a vertical list whose rows each hold a focusable control (a table of rows that
 * open a detail view): the arrow keys, Page Up / Down, Home and End choose the row and move focus to its control,
 * found by its `data-list-index`, and scroll its row (`tr` or `li`) into view. Spread `onKeyDown` on the element that
 * holds the rows and `getItemProps(index)` on each row's control: the list is one Tab stop (a roving tabindex on the
 * selected row, or the first while none is), and the arrow keys move within it.
 */
export function useListNavigation({
  count,
  value,
  onValueChange,
  pageSize,
}: {
  count: number;
  /** The index of the selected row, -1 for none. */
  value: number;
  /** Called with the index of the row the key chose. */
  onValueChange: (index: number) => void;
  pageSize?: number;
}) {
  const tabStop = value >= 0 && value < count ? value : 0;
  return {
    getItemProps: (index: number) => ({ "data-list-index": index, tabIndex: index === tabStop ? 0 : -1 }),
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const next = nextListIndex(event.key, value, count, pageSize);
      if (next === null) return;
      event.preventDefault();
      if (next !== value) onValueChange(next);
      const control = event.currentTarget.querySelector<HTMLElement>(`[data-list-index="${next}"]`);
      if (!control) return;
      // The whole row comes into view, not only its control, and only as far as needed; the scroll box's scroll
      // padding keeps it clear of a sticky head or foot row.
      control.focus({ preventScroll: true });
      (control.closest("tr, li") ?? control).scrollIntoView({ block: "nearest" });
    },
  };
}
