import { useCallback, useEffect, useRef, useState } from "react";

import { annotatedAncestor, resolveSource } from "~/lib/annotation-source";

interface ElementPickerProps {
  onPick: (element: HTMLElement) => void;
  onCancel: () => void;
}

interface Highlight {
  top: number;
  left: number;
  width: number;
  height: number;
  label: string;
}

function labelFor(element: HTMLElement): string {
  const tag = element.tagName.toLowerCase();
  const component = resolveSource(element)?.component;
  return component ? `${component} · ${tag}` : tag;
}

function highlightFor(element: HTMLElement): Highlight {
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    label: labelFor(element),
  };
}

// Listeners are attached in the capture phase so a click lands here instead of
// activating the control underneath.
export function ElementPicker({ onPick, onCancel }: ElementPickerProps) {
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const hoveredRef = useRef<HTMLElement | null>(null);

  const track = useCallback((element: HTMLElement | null) => {
    if (element === hoveredRef.current) return;
    hoveredRef.current = element;
    setHighlight(element ? highlightFor(element) : null);
  }, []);

  useEffect(() => {
    // Falls back to the raw element so picking still works on nodes that carry
    // no source id (portals, third-party markup, an uninstrumented dev server).
    const candidate = (event: Event): HTMLElement | null => {
      const target = event.target as Element | null;
      if (!target || target.closest("[data-feedback-ui]")) return null;
      return annotatedAncestor(target) ?? (target instanceof HTMLElement ? target : null);
    };

    const onMouseMove = (event: MouseEvent) => track(candidate(event));

    const onClick = (event: MouseEvent) => {
      const element = candidate(event);
      if (!element) return;
      event.preventDefault();
      event.stopPropagation();
      onPick(element);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };

    const onViewportChange = () => {
      if (hoveredRef.current?.isConnected) setHighlight(highlightFor(hoveredRef.current));
    };

    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", onViewportChange, true);
    window.addEventListener("resize", onViewportChange);
    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = "crosshair";

    return () => {
      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("resize", onViewportChange);
      document.body.style.cursor = previousCursor;
    };
  }, [onPick, onCancel, track]);

  return (
    <div className="pointer-events-none fixed inset-0 z-[100]" data-feedback-ui>
      {highlight && (
        <div
          className="absolute rounded-sm bg-primary/10 ring-2 ring-primary transition-all duration-75"
          style={{
            top: highlight.top,
            left: highlight.left,
            width: highlight.width,
            height: highlight.height,
          }}
        >
          <span
            className="absolute left-0 max-w-[18rem] truncate rounded bg-primary px-1.5 py-0.5 font-mono text-xs text-primary-foreground"
            style={highlight.top < 28 ? { top: "100%" } : { bottom: "100%" }}
          >
            {highlight.label}
          </span>
        </div>
      )}
      <div className="fixed top-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm text-background shadow-lg">
        Click anything on the page to attach your feedback to it
        <kbd className="rounded border border-background/30 px-1.5 py-0.5 text-xs">Esc</kbd>
        to cancel
      </div>
    </div>
  );
}
