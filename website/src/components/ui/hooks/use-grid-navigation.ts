import { type KeyboardEvent, useRef, useState } from "react";

/**
 * Keyboard navigation of a grid that is one tab stop (WAI-ARIA grid pattern): arrows move between cells, Home and End
 * within a row, Control Home or End to the first or last cell. Cells are indexed row by row; a cell that was never
 * registered (a ragged last row) is not moved to.
 */
export function useGridNavigation<T extends HTMLElement>(columns: number) {
  const [activeIndex, setActiveIndex] = useState(0);
  const cells = useRef<(T | null)[]>([]);

  function onKeyDown(event: KeyboardEvent<T>, index: number) {
    if (event.altKey) return;
    const column = index % columns;
    const last = cells.current.length - 1;
    const jump = event.ctrlKey || event.metaKey;
    let next = index;
    switch (event.key) {
      case "ArrowRight":
        next = column < columns - 1 ? index + 1 : index;
        break;
      case "ArrowLeft":
        next = column > 0 ? index - 1 : index;
        break;
      case "ArrowDown":
        next = index + columns;
        break;
      case "ArrowUp":
        next = index - columns;
        break;
      case "Home":
        next = jump ? 0 : index - column;
        break;
      case "End":
        next = jump ? last : Math.min(index - column + columns - 1, last);
        break;
      default:
        return;
    }
    event.preventDefault();
    cells.current[next]?.focus();
  }

  return {
    activeIndex,
    setActiveIndex,
    onKeyDown,
    register: (index: number) => (cell: T | null) => {
      cells.current[index] = cell;
    },
  };
}
