import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Kbd } from "~/components/ui/kbd";
import { SelectionBox } from "~/components/ui/selection-box";
import { Inline } from "~/components/ui/stack";
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
      // The press starts a pick, not a page action: no focus move, no menu opening on mousedown.
      event.preventDefault();
      event.stopPropagation();
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
    // Radix menus and selects open on pointerdown. Only stopped, not prevented: preventing it would cancel the
    // mousedown and mouseup the pick itself is made of.
    const stopPointerDown = (event: PointerEvent) => {
      if ((event.target as Element | null)?.closest("[data-feedback-ui]")) return;
      event.stopPropagation();
    };

    // Handled keys stop here, so Escape does not also close a page dialog and Enter does not press a focused link.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }
      if (event.key === "Enter" && selectedRef.current.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        onPick(selectedRef.current);
      }
    };

    const onViewportChange = () => {
      setBoxes(selectedRef.current.map(highlightFor));
      if (hoveredRef.current?.isConnected) setHovered(highlightFor(hoveredRef.current));
    };

    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("mouseup", onMouseUp, true);
    document.addEventListener("click", swallow, true);
    document.addEventListener("pointerdown", stopPointerDown, true);
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
      document.removeEventListener("pointerdown", stopPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("resize", onViewportChange);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelect;
    };
  }, [onPick, onCancel, track, select]);

  return (
    <div className="pointer-events-none fixed inset-0 z-100" data-feedback-ui>
      {boxes.map((box) => (
        <SelectionBox
          key={box.key}
          state="selected"
          label={box.label}
          labelPosition={box.top < 28 ? "below" : "above"}
          style={{ top: box.top, insetInlineStart: box.left, width: box.width, height: box.height }}
        />
      ))}

      {hovered && !marquee && (
        <SelectionBox
          state="hovered"
          label={hovered.label}
          labelPosition={hovered.top < 28 ? "below" : "above"}
          style={{ top: hovered.top, insetInlineStart: hovered.left, width: hovered.width, height: hovered.height }}
        />
      )}

      {marquee && (
        <SelectionBox
          state="marquee"
          style={{ top: marquee.top, insetInlineStart: marquee.left, width: marquee.width, height: marquee.height }}
        />
      )}

      <Card tone="floating" size="xs" className="fixed inset-s-1/2 top-4 -translate-x-1/2 items-center gap-1 px-4 py-2">
        <Inline gap={2} wrap="nowrap" className="text-sm">
          Click or drag a box around what your feedback is about
          <Kbd>Esc</Kbd>
          to cancel
        </Inline>
        <Inline gap={2} wrap="nowrap" className="text-xs text-muted-foreground">
          Hold
          <Kbd>Ctrl</Kbd>
          to keep picking
          {selected.length > 0 && (
            <Button
              variant="secondary"
              size="xs"
              shape="pill"
              className="pointer-events-auto"
              onClick={() => onPick(selected)}
            >
              Done · {selected.length}
              {selected.length === MAX_TARGETS && " (max)"}
            </Button>
          )}
        </Inline>
      </Card>
    </div>
  );
}
