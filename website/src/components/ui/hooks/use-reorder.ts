import { useEffect, useId, useRef, useState } from "react";

/** Pixels a pointer travels before a press becomes a drag, so a plain click never moves anything. */
const DRAG_THRESHOLD = 5;

/** `list` with the item at `from` moved to `to`, the others closing up around it: what an `onMove` usually does. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

interface Drag {
  from: number;
  over: number;
  /** How far the pointer has moved since the press. */
  dx: number;
  dy: number;
  /** The boxes' places when the drag began: the slots the dragged box can land in. */
  slots: DOMRect[];
  /** Whether the items have boxes that preview the drop; without, the handle under the pointer rings instead. */
  boxed: boolean;
}

/**
 * Reordering a row (or a wrapping grid) of items by pointer (mouse, touch, pen) or keyboard. Spread `itemProps(index)`
 * on each item's handle and, when the items are larger than their handles, `boxProps(index)` on each item's box
 * (`ReorderItem`): while a handle is dragged its box follows the pointer and the other boxes slide aside to show where
 * it will land; releasing moves it there. With the handle focused, the arrow keys move it one place along `axis`.
 * `announcement` says where the last keyboard move landed, for a live region.
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
  /** The press, and the boxes' places when the drag began: the slots the dragged box can land in. */
  const press = useRef<{
    index: number;
    x: number;
    y: number;
    measured: { slots: DOMRect[]; boxed: boolean } | null;
  } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  // The frame the new order lands in: the boxes drop their offsets without animating, since they are already in place.
  const [settling, setSettling] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    if (!settling) return;
    const frame = requestAnimationFrame(() => setSettling(false));
    return () => cancelAnimationFrame(frame);
  }, [settling]);

  /** Where every box of the group sits now, in index order: the boxes when there are any, else the handles. */
  const measure = (): { slots: DOMRect[]; boxed: boolean } => {
    const boxes = document.querySelectorAll<HTMLElement>(`[data-reorder-box="${group}"]`);
    const elements =
      boxes.length > 0 ? boxes : document.querySelectorAll<HTMLElement>(`[data-reorder-group="${group}"]`);
    const slots = [...elements]
      .sort((a, b) => Number(a.dataset.reorderIndex) - Number(b.dataset.reorderIndex))
      .map((element) => element.getBoundingClientRect());
    return { slots, boxed: boxes.length > 0 };
  };

  const finish = () => {
    press.current = null;
    setDrag(null);
  };

  const itemProps = (index: number) => ({
    "data-reorder-group": group,
    "data-reorder-index": index,
    "data-dragging": drag?.from === index || undefined,
    "data-over": (drag && !drag.boxed && drag.over === index && drag.from !== index) || undefined,
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      press.current = { index, x: event.clientX, y: event.clientY, measured: null };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
      const start = press.current;
      if (!start) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (!drag && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      const measured = start.measured ?? measure();
      start.measured = measured;
      const { slots, boxed } = measured;
      const own = slots[start.index];
      if (!own) return;
      // The slot whose centre is nearest the dragged box's centre is where it would land.
      const cx = own.left + own.width / 2 + dx;
      const cy = own.top + own.height / 2 + dy;
      let over = start.index;
      let best = Infinity;
      for (const [slotIndex, slot] of slots.entries()) {
        const distance = Math.hypot(slot.left + slot.width / 2 - cx, slot.top + slot.height / 2 - cy);
        if (distance < best) {
          best = distance;
          over = slotIndex;
        }
      }
      setDrag({ from: start.index, over, dx, dy, slots, boxed });
    },
    onPointerUp: () => {
      if (drag && drag.from !== drag.over) {
        setSettling(true);
        onMove(drag.from, drag.over);
      }
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

  /**
   * The box of item `index`: while dragging, the dragged box follows the pointer and every other box shifts to the
   * slot it would take in the new order. Geometry only; `ReorderItem` draws the lifted state from `data-dragging`.
   */
  const boxProps = (index: number) => {
    const slots = drag?.slots;
    let transform: string | undefined;
    if (drag && slots) {
      if (index === drag.from) {
        transform = `translate(${drag.dx}px, ${drag.dy}px)`;
      } else {
        const order = moveItem(
          slots.map((_, slotIndex) => slotIndex),
          drag.from,
          drag.over,
        );
        const target = slots[order.indexOf(index)];
        const own = slots[index];
        if (target && own) transform = `translate(${target.left - own.left}px, ${target.top - own.top}px)`;
      }
    }
    return {
      "data-reorder-box": group,
      "data-reorder-index": index,
      "data-dragging": drag?.from === index || undefined,
      "data-reordering": drag != null || undefined,
      "data-settling": settling || undefined,
      style: transform ? { transform } : undefined,
    };
  };

  return { itemProps, boxProps, announcement };
}
