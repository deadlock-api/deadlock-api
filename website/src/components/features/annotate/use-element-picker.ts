import { useCallback, useEffect, useRef, useState } from "react";

import { annotatedAncestor, resolveSource } from "~/lib/annotation-source";

export const MAX_TARGETS = 20;

// Below this a press is a click, above it a marquee drag.
const DRAG_THRESHOLD = 6;

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Highlight extends Box {
  label: string;
  key: string;
}

interface Point {
  x: number;
  y: number;
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

// A route that writes its whole page inline names every element after itself,
// so the line is what actually tells two of them apart.
function labelFor(element: HTMLElement): string {
  const tag = element.tagName.toLowerCase();
  const source = resolveSource(element);
  if (!source) return tag;
  return `${source.component ?? "?"} · ${tag}:${source.line}`;
}

/** What a screen reader hears for an element: its component, or its tag, and the start of its text. */
export function spokenLabelFor(element: HTMLElement): string {
  const name = resolveSource(element)?.component ?? element.tagName.toLowerCase();
  const text = element.innerText.trim().replaceAll(/\s+/g, " ").slice(0, 60);
  return text ? `${name}: ${text}` : name;
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

// The picker's own overlay and the feedback panel are never picked, and presses on them reach them as usual.
function inFeedbackUi(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("[data-feedback-ui]") !== null;
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

// The keyboard walks the tree of pickable elements: annotated ones in a production build, any element on a dev server
// that stamps no ids. Hidden ones and the feedback UI are skipped.
function isPickable(element: Element, annotated: boolean): boolean {
  if (!(element instanceof HTMLElement) || inFeedbackUi(element)) return false;
  if (annotated && !element.hasAttribute("data-dl")) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/** The nearest pickable elements under `root`, not those nested inside another one. */
function pickableChildren(root: Element, annotated: boolean): HTMLElement[] {
  const found: HTMLElement[] = [];
  for (const child of root.children) {
    if (child instanceof HTMLElement && isPickable(child, annotated)) found.push(child);
    else found.push(...pickableChildren(child, annotated));
  }
  return found;
}

function pickableParent(element: HTMLElement, annotated: boolean): HTMLElement | null {
  for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    if (isPickable(parent, annotated)) return parent;
  }
  return null;
}

/** Where the arrow keys lead from `from`: ↑ to its parent, ↓ to its first child, ← and → to its siblings. */
function stepFrom(from: HTMLElement | null, key: string, annotated: boolean): HTMLElement | null {
  if (!from?.isConnected) {
    // The first press starts at the middle of the screen, where the reader is looking.
    const under = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    for (let element = under; element && element !== document.body; element = element.parentElement) {
      if (element instanceof HTMLElement && isPickable(element, annotated)) return element;
    }
    return pickableChildren(document.body, annotated)[0] ?? null;
  }
  if (key === "ArrowUp") return pickableParent(from, annotated) ?? from;
  if (key === "ArrowDown") return pickableChildren(from, annotated)[0] ?? from;
  const parent = pickableParent(from, annotated);
  const siblings = pickableChildren(parent ?? document.body, annotated);
  const at = siblings.indexOf(from);
  if (at === -1) return from;
  const next = key === "ArrowRight" ? at + 1 : at - 1;
  return siblings[(next + siblings.length) % siblings.length] ?? from;
}

const ARROWS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

/**
 * The element picker's behaviour, headless: a click picks one element, a drag picks all it encloses, Ctrl (⌘) adds to
 * the pick. The keyboard has the same reach: the arrow keys walk the page's elements (↑ parent, ↓ child, ← → siblings),
 * Space adds or removes the highlighted one, Enter finishes and Escape cancels. Tab stays inside `bar`, the picker's
 * own controls, which take the focus when the picker starts. Listeners are attached in the capture phase so a click
 * lands here instead of activating the control underneath.
 */
export function useElementPicker({
  onPick,
  onCancel,
}: {
  onPick: (elements: HTMLElement[]) => void;
  onCancel: () => void;
}) {
  const [hovered, setHovered] = useState<Highlight | null>(null);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [selected, setSelected] = useState<HTMLElement[]>([]);
  const [boxes, setBoxes] = useState<Highlight[]>([]);
  /** What the status line says: the element the keys highlight, or the last change to the pick. */
  const [status, setStatus] = useState("");
  const bar = useRef<HTMLDivElement>(null);

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
    // The bar takes the focus, so the keys reach the picker and a screen reader hears what it is for.
    bar.current?.focus();
    const annotated = document.querySelector("[data-dl]") !== null;

    // Falls back to the raw element so picking still works on nodes that carry
    // no source id (portals, third-party markup, an uninstrumented dev server).
    const candidate = (event: Event): HTMLElement | null => {
      const target = event.target;
      if (!(target instanceof Element) || inFeedbackUi(target)) return null;
      return annotatedAncestor(target) ?? (target instanceof HTMLElement ? target : null);
    };

    const toggle = (element: HTMLElement) => {
      const current = selectedRef.current;
      const removing = current.includes(element);
      select(removing ? current.filter((other) => other !== element) : [...current, element]);
      setStatus(`${removing ? "Removed" : "Added"} ${spokenLabelFor(element)}`);
    };

    // The drag adds to whatever was already picked, so a marquee can extend a
    // Ctrl-click selection.
    const withMarquee = (box: Box) => {
      const base = baseRef.current;
      return [...base, ...elementsInside(box).filter((element) => !base.includes(element))];
    };

    const onMouseDown = (event: MouseEvent) => {
      if (inFeedbackUi(event.target)) return;
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
      if (inFeedbackUi(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    // Radix menus and selects open on pointerdown. Only stopped, not prevented: preventing it would cancel the
    // mousedown and mouseup the pick itself is made of.
    const stopPointerDown = (event: PointerEvent) => {
      if (inFeedbackUi(event.target)) return;
      event.stopPropagation();
    };

    const handled = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };

    // Handled keys stop here, so Escape does not also close a page dialog and Enter does not press a focused link.
    // The picker's own buttons keep Enter and Space.
    const onKeyDown = (event: KeyboardEvent) => {
      const onOwnControl =
        event.target instanceof Element && event.target.closest("button") && inFeedbackUi(event.target);
      if (event.key === "Escape") {
        handled(event);
        onCancel();
        return;
      }
      if (event.key === "Tab") {
        // Tab cycles through the picker's own controls; the page behind is not reachable while picking.
        const controls = [...(bar.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? [])];
        if (controls.length === 0) return;
        handled(event);
        const at = controls.indexOf(document.activeElement as HTMLElement);
        const next = event.shiftKey ? (at <= 0 ? controls.length - 1 : at - 1) : (at + 1) % controls.length;
        controls[next]?.focus();
        return;
      }
      if (ARROWS.has(event.key) && !event.altKey && !event.ctrlKey && !event.metaKey) {
        handled(event);
        const next = stepFrom(hoveredRef.current, event.key, annotated);
        if (!next) return;
        next.scrollIntoView({ block: "nearest", inline: "nearest" });
        hoveredRef.current = null;
        track(next);
        setStatus(spokenLabelFor(next));
        return;
      }
      if (onOwnControl) return;
      if (event.key === " " && hoveredRef.current?.isConnected) {
        handled(event);
        toggle(hoveredRef.current);
        return;
      }
      if (event.key === "Enter") {
        const picked =
          selectedRef.current.length > 0 ? selectedRef.current : hoveredRef.current ? [hoveredRef.current] : [];
        if (picked.length === 0) return;
        handled(event);
        onPick(picked);
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

  return { bar, hovered, marquee, selected, boxes, status };
}
