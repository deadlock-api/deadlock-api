import { useCallback, useEffect, useRef, useState } from "react";

import { annotatedAncestor, resolveSource } from "~/lib/annotation-source";

export const MAX_TARGETS = 20;

// Below this a press is a click, above it a marquee drag.
const DRAG_THRESHOLD = 6;

interface ElementPickerProps {
  onPick: (elements: HTMLElement[]) => void;
  onCancel: () => void;
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface Highlight extends Box {
  label: string;
  key: string;
}

// A repeated component renders the same `data-dl` on every instance, so element
// identity is the only thing that distinguishes two selected cards.
const elementKeys = new WeakMap<HTMLElement, string>();
let nextKey = 0;

function keyFor(element: HTMLElement): string {
  let key = elementKeys.get(element);
  if (!key) {
    key = `dl${(nextKey += 1)}`;
    elementKeys.set(element, key);
  }
  return key;
}

interface Point {
  x: number;
  y: number;
}

// A route that writes its whole page inline names every element after itself,
// so the line is what actually tells two of them apart.
function labelFor(element: HTMLElement): string {
  const tag = element.tagName.toLowerCase();
  const source = resolveSource(element);
  if (!source) return tag;
  return `${source.component ?? "?"} · ${tag}:${source.line}`;
}

function highlightFor(element: HTMLElement): Highlight {
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    label: labelFor(element),
    key: keyFor(element),
  };
}

function boxBetween(a: Point, b: Point): Box {
  return {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

/**
 * Every annotated element the marquee encloses, minus those nested inside
 * another hit. Enclosing rather than merely touching, so dragging across a
 * region picks what is visibly inside it instead of the containers it sits in.
 */
function elementsInside(box: Box): HTMLElement[] {
  const right = box.left + box.width;
  const bottom = box.top + box.height;
  const hits = [...document.querySelectorAll<HTMLElement>("[data-dl]")].filter((element) => {
    if (element.closest("[data-feedback-ui]")) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    return rect.left >= box.left && rect.right <= right && rect.top >= box.top && rect.bottom <= bottom;
  });

  const found = new Set(hits);
  return hits.filter((element) => {
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (found.has(parent)) return false;
    }
    return true;
  });
}

// Listeners are attached in the capture phase so a click lands here instead of
// activating the control underneath.
export function ElementPicker({ onPick, onCancel }: ElementPickerProps) {
  const [hovered, setHovered] = useState<Highlight | null>(null);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [selected, setSelected] = useState<HTMLElement[]>([]);
  const [boxes, setBoxes] = useState<Highlight[]>([]);

  const hoveredRef = useRef<HTMLElement | null>(null);
  const originRef = useRef<Point | null>(null);
  const draggedRef = useRef(false);
  // What was selected before the current drag started, so shrinking the
  // rectangle gives elements back instead of accumulating them.
  const baseRef = useRef<HTMLElement[]>([]);
  const frameRef = useRef(0);
  // Mirrors `selected` for the document-level listeners, which are registered once.
  const selectedRef = useRef<HTMLElement[]>([]);

  const select = useCallback((elements: HTMLElement[]) => {
    const next = elements.slice(0, MAX_TARGETS);
    selectedRef.current = next;
    setSelected(next);
    setBoxes(next.map(highlightFor));
  }, []);

  const track = useCallback((element: HTMLElement | null) => {
    if (element === hoveredRef.current) return;
    hoveredRef.current = element;
    setHovered(element ? highlightFor(element) : null);
  }, []);

  useEffect(() => {
    // Falls back to the raw element so picking still works on nodes that carry
    // no source id (portals, third-party markup, an uninstrumented dev server).
    const candidate = (event: Event): HTMLElement | null => {
      const target = event.target as Element | null;
      if (!target || target.closest("[data-feedback-ui]")) return null;
      return annotatedAncestor(target) ?? (target instanceof HTMLElement ? target : null);
    };

    const toggle = (element: HTMLElement) => {
      const current = selectedRef.current;
      select(current.includes(element) ? current.filter((other) => other !== element) : [...current, element]);
    };

    // The drag adds to whatever was already picked, so a marquee can extend a
    // Ctrl-click selection.
    const withMarquee = (box: Box) => {
      const base = baseRef.current;
      return [...base, ...elementsInside(box).filter((element) => !base.includes(element))];
    };

    const onMouseDown = (event: MouseEvent) => {
      if ((event.target as Element | null)?.closest("[data-feedback-ui]")) return;
      originRef.current = { x: event.clientX, y: event.clientY };
      draggedRef.current = false;
      baseRef.current = selectedRef.current;
    };

    const onMouseMove = (event: MouseEvent) => {
      const origin = originRef.current;
      if (!origin) {
        track(candidate(event));
        return;
      }
      const point = { x: event.clientX, y: event.clientY };
      if (!draggedRef.current && Math.hypot(point.x - origin.x, point.y - origin.y) < DRAG_THRESHOLD) return;
      draggedRef.current = true;
      track(null);

      const box = boxBetween(origin, point);
      setMarquee(box);
      // Measuring every annotated element is a full layout read, so it happens
      // once per frame rather than once per mousemove.
      cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(() => select(withMarquee(box)));
    };

    const onMouseUp = (event: MouseEvent) => {
      const origin = originRef.current;
      originRef.current = null;
      if (!origin) return;

      const holdingCtrl = event.ctrlKey || event.metaKey;

      if (draggedRef.current) {
        cancelAnimationFrame(frameRef.current);
        const picked = withMarquee(boxBetween(origin, { x: event.clientX, y: event.clientY })).slice(0, MAX_TARGETS);
        setMarquee(null);
        select(picked);
        // An empty box selected nothing, so there is nothing to go back with.
        if (!holdingCtrl && picked.length > 0) onPick(picked);
        return;
      }

      const element = candidate(event);
      if (!element) return;
      if (holdingCtrl) {
        toggle(element);
        return;
      }
      onPick([element]);
    };

    // Whatever the press turned out to be, the page must not react to it.
    const swallow = (event: MouseEvent) => {
      if ((event.target as Element | null)?.closest("[data-feedback-ui]")) return;
      event.preventDefault();
      event.stopPropagation();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
      if (event.key === "Enter" && selectedRef.current.length > 0) onPick(selectedRef.current);
    };

    const onViewportChange = () => {
      setBoxes(selectedRef.current.map(highlightFor));
      if (hoveredRef.current?.isConnected) setHovered(highlightFor(hoveredRef.current));
    };

    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("mouseup", onMouseUp, true);
    document.addEventListener("click", swallow, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", onViewportChange, true);
    window.addEventListener("resize", onViewportChange);
    const previousCursor = document.body.style.cursor;
    const previousSelect = document.body.style.userSelect;
    document.body.style.cursor = "crosshair";
    document.body.style.userSelect = "none";

    return () => {
      cancelAnimationFrame(frameRef.current);
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("mouseup", onMouseUp, true);
      document.removeEventListener("click", swallow, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("resize", onViewportChange);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelect;
    };
  }, [onPick, onCancel, track, select]);

  return (
    <div className="pointer-events-none fixed inset-0 z-[100]" data-feedback-ui>
      {boxes.map((box) => (
        <div
          key={box.key}
          className="absolute rounded-sm bg-primary/15 ring-2 ring-primary"
          style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
        >
          <span
            className="absolute left-0 max-w-[18rem] truncate rounded bg-primary px-1.5 py-0.5 font-mono text-xs text-primary-foreground"
            style={box.top < 28 ? { top: "100%" } : { bottom: "100%" }}
          >
            {box.label}
          </span>
        </div>
      ))}

      {hovered && !marquee && (
        <div
          className="absolute rounded-sm bg-primary/10 ring-2 ring-primary transition-all duration-75"
          style={{ top: hovered.top, left: hovered.left, width: hovered.width, height: hovered.height }}
        >
          <span
            className="absolute left-0 max-w-[18rem] truncate rounded bg-primary px-1.5 py-0.5 font-mono text-xs text-primary-foreground"
            style={hovered.top < 28 ? { top: "100%" } : { bottom: "100%" }}
          >
            {hovered.label}
          </span>
        </div>
      )}

      {marquee && (
        <div
          className="absolute rounded-sm border-2 border-dashed border-primary bg-primary/5"
          style={{ top: marquee.top, left: marquee.left, width: marquee.width, height: marquee.height }}
        />
      )}

      <div className="fixed top-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1 rounded-2xl bg-foreground px-4 py-2 text-sm text-background shadow-lg">
        <div className="flex items-center gap-2">
          Click or drag a box around what your feedback is about
          <kbd className="rounded border border-background/30 px-1.5 py-0.5 text-xs">Esc</kbd>
          to cancel
        </div>
        <div className="flex items-center gap-2 text-xs opacity-80">
          Hold
          <kbd className="rounded border border-background/30 px-1 py-0.5">Ctrl</kbd>
          to keep picking
          {selected.length > 0 && (
            <button
              type="button"
              className="pointer-events-auto rounded-full bg-background px-2 py-0.5 font-medium text-foreground"
              onClick={() => onPick(selected)}
            >
              Done · {selected.length}
              {selected.length === MAX_TARGETS && " (max)"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
