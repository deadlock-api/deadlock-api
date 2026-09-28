import { useId, useRef, useState } from "react";

/** Pixels a pointer travels before a press becomes a drag, so a plain click never moves anything. */
const DRAG_THRESHOLD = 5;

/** `list` with the item at `from` moved to `to`, the others closing up around it: what an `onMove` usually does. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Reordering a row of items by pointer (mouse, touch, pen) or keyboard. Spread `itemProps(index)` on each item's
 * handle: dragging a handle over another moves it there on release; with the handle focused, the arrow keys move it
 * one place along `axis`. `announcement` says where the last keyboard move landed, for a live region.
 */
export function useReorder({
  count,
  onMove,
  axis = "horizontal",
  itemLabel = (index: number) => `Item ${index + 1}`,
}: {
  count: number;
  /** The item at `from` goes to `to`; the others close up around it. */
  onMove: (from: number, to: number) => void;
  axis?: "horizontal" | "vertical";
  /** Names an item in the announcement: "Tas moved to position 2 of 3". */
  itemLabel?: (index: number) => string;
}) {
  const group = useId();
  const press = useRef<{ index: number; x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const finish = () => {
    press.current = null;
    setDrag(null);
  };

  const itemProps = (index: number) => ({
    "data-reorder-group": group,
    "data-reorder-index": index,
    "data-dragging": drag?.from === index || undefined,
    "data-over": (drag && drag.over === index && drag.from !== index) || undefined,
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      press.current = { index, x: event.clientX, y: event.clientY };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
      const start = press.current;
      if (!start) return;
      if (!drag && Math.hypot(event.clientX - start.x, event.clientY - start.y) < DRAG_THRESHOLD) return;
      // The item under the pointer, from this group only; between items, the last one it was over.
      const target = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>(`[data-reorder-group="${group}"]`);
      const over = target ? Number(target.dataset.reorderIndex) : (drag?.over ?? start.index);
      if (drag?.over !== over || !drag) setDrag({ from: start.index, over });
    },
    onPointerUp: () => {
      if (drag && drag.from !== drag.over) onMove(drag.from, drag.over);
      finish();
    },
    onPointerCancel: finish,
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
      const back = axis === "horizontal" ? "ArrowLeft" : "ArrowUp";
      const forward = axis === "horizontal" ? "ArrowRight" : "ArrowDown";
      const step = event.key === back ? -1 : event.key === forward ? 1 : 0;
      const to = index + step;
      if (step === 0 || to < 0 || to >= count) return;
      event.preventDefault();
      onMove(index, to);
      setAnnouncement(`${itemLabel(index)} moved to position ${to + 1} of ${count}`);
    },
  });

  return { itemProps, announcement };
}
