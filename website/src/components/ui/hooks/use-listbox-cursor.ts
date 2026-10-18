import { useId, useRef, useState } from "react";

interface CursorState<T> {
  at: number;
  /** Whether the reader put the cursor there (the arrow keys, the pointer), rather than it resting on the top row. */
  moved: boolean;
  /** A row the cursor should rest on once one is there ("the first player"), matched against the rows of each render. */
  prefer: ((item: T) => boolean) | null;
}

const RESTING = { at: 0, moved: false, prefer: null };

/**
 * Headless keyboard cursor for the popup list of a combobox (focus stays in the field, `aria-activedescendant` names
 * the option under the cursor). The arrow keys move it, wrapping at the ends; the pointer moves it only when it really
 * moves, so a row that slides under a still pointer while results arrive never takes the cursor. `preferFirst(match)`
 * puts it on the first row that matches, resolved against the rows of each render, so rows that load later still get
 * it. Spread `getOptionProps(index)` on each option (its role, id, selection, a press that keeps the field's focus) and pass `activeId` to the field's `aria-activedescendant`.
 */
export function useListboxCursor<T>(
  /** The list's rows, in order: the cursor and `preferFirst` are resolved against them on every render. */
  list: readonly T[],
  { open = true }: { open?: boolean } = {},
) {
  const listId = useId();
  const [state, setState] = useState<CursorState<T>>(RESTING);
  /** The pointer's last position over the list: a pointermove at the same spot is the list moving, not the pointer. */
  const lastPointer = useRef<{ x: number; y: number } | null>(null);

  const count = list.length;
  const preferred = state.prefer ? list.findIndex(state.prefer) : -1;
  const active = count === 0 ? -1 : preferred >= 0 ? preferred : Math.min(state.at, count - 1);
  const moved = state.moved || preferred >= 0;

  const optionId = (index: number) => `${listId}-${index}`;

  return {
    listId,
    /** The index of the row under the cursor, -1 while the list is empty. */
    active,
    moved,
    activeId: open && active >= 0 ? optionId(active) : undefined,
    /** Back to the top row, as when the question changes. */
    reset: () => setState(RESTING),
    /** Rest on the first row `match` accepts, now or once such a row arrives. */
    preferFirst: (match: (item: T) => boolean) => setState({ at: 0, moved: true, prefer: match }),
    /** ArrowDown / ArrowUp move the cursor; returns whether the key was handled. */
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
      if (!open || count === 0 || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return false;
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setState({ at: (Math.max(active, 0) + step + count) % count, moved: true, prefer: null });
      return true;
    },
    getOptionProps: (index: number) => ({
      id: optionId(index),
      role: "option" as const,
      "aria-selected": index === active,
      active: index === active,
      // Options are reached through the field, never tabbed to, and a press keeps the focus in the field.
      tabIndex: -1,
      onMouseDown: (event: React.MouseEvent<HTMLElement>) => event.preventDefault(),
      onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
        const last = lastPointer.current;
        lastPointer.current = { x: event.clientX, y: event.clientY };
        if (
          last ? last.x === event.clientX && last.y === event.clientY : event.movementX === 0 && event.movementY === 0
        ) {
          return;
        }
        if (index !== active || !moved) setState({ at: index, moved: true, prefer: null });
      },
      onPointerLeave: () => {
        lastPointer.current = null;
      },
    }),
  };
}
