import { Minus, Plus, RotateCcw } from "lucide-react";
import { type RefObject, useEffect, useRef, useState } from "react";

import { ChartOverlayItem } from "~/components/patterns/charts/ChartOverlay";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

/**
 * How a zoomable plot is shown: drawn `scale` times its size and moved by `x`, `y`, as shares of the target's width
 * and height. A point at `p` (0 to 1) of the plot sits at `p * scale + x` of the target.
 */
export interface ChartZoomView {
  scale: number;
  x: number;
  y: number;
}

export const CHART_ZOOM_IDENTITY: ChartZoomView = { scale: 1, x: 0, y: 0 };

/** Each press of a zoom button or key zooms by this factor; a double click by its square. */
const ZOOM_STEP = 1.5;
/** The arrow keys move the view by this share of the target (Shift: four times as far). */
const PAN_STEP = 0.1;
/** Wheel pixels to zoom: a notch (100px) zooms by about 1.2×. A trackpad pinch arrives as a ctrl wheel, finer. */
const WHEEL_RATE = 0.0018;
const PINCH_WHEEL_RATE = 0.01;

const ARROW: Record<string, [number, number]> = {
  ArrowLeft: [1, 0],
  ArrowRight: [-1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** The view kept over the target: never smaller than the target, never moved off its edges. */
export function clampChartZoom(view: ChartZoomView, max: number): ChartZoomView {
  const scale = clamp(view.scale, 1, max);
  return { scale, x: clamp(view.x, 1 - scale, 0), y: clamp(view.y, 1 - scale, 0) };
}

/** The view zoomed by `factor` around the point `at` of the target (0 to 1 on each axis), which stays in place. */
export function zoomChartAt(view: ChartZoomView, factor: number, at: { x: number; y: number }, max: number) {
  const scale = clamp(view.scale * factor, 1, max);
  const ratio = scale / view.scale;
  return clampChartZoom({ scale, x: at.x - (at.x - view.x) * ratio, y: at.y - (at.y - view.y) * ratio }, max);
}

const sameView = (a: ChartZoomView, b: ChartZoomView) => a.scale === b.scale && a.x === b.x && a.y === b.y;

/**
 * Zoom and pan for a plot drawn on a canvas (a map): the wheel or a pinch zooms around the pointer, a drag or one
 * finger pans a zoomed plot, a double click zooms in, and on the focused target `+` / `-` zoom, the arrow keys pan
 * (Shift: further) and `0` resets. Spread `targetProps` on the drawn element and pass `targetRef` to it (the wheel
 * needs a native listener to keep the page from scrolling); draw with `view`. Unzoomed, one finger and a wheel that
 * zooms out still scroll the page. `ChartZoomControls` gives the buttons.
 */
export function useChartZoom(targetRef: RefObject<HTMLElement | null>, { max = 8 }: { max?: number } = {}) {
  const [view, setView] = useState<ChartZoomView>(CHART_ZOOM_IDENTITY);
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  const update = (next: (view: ChartZoomView) => ChartZoomView) =>
    setView((current) => {
      const value = next(current);
      return sameView(current, value) ? current : value;
    });

  /** A client point as a share of the target. */
  const relative = (clientX: number, clientY: number) => {
    const rect = targetRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return { x: 0.5, y: 0.5 };
    return { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height };
  };

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;
    const onWheel = (event: WheelEvent) => {
      const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1);
      // Unzoomed, a wheel that zooms out is left to scroll the page.
      if (pixels > 0 && view.scale <= 1) return;
      event.preventDefault();
      const rect = target.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const at = { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
      const factor = Math.exp(-pixels * (event.ctrlKey ? PINCH_WHEEL_RATE : WHEEL_RATE));
      setView((current) => {
        const next = zoomChartAt(current, factor, at, max);
        return sameView(current, next) ? current : next;
      });
    };
    target.addEventListener("wheel", onWheel, { passive: false });
    return () => target.removeEventListener("wheel", onWheel);
  }, [targetRef, max, view.scale]);

  const zoomBy = (factor: number) => update((current) => zoomChartAt(current, factor, { x: 0.5, y: 0.5 }, max));
  const zoomed = view.scale > 1;

  const targetProps = {
    tabIndex: 0,
    "data-slot": "chart-zoom-target",
    "data-zoomed": zoomed || undefined,
    "aria-keyshortcuts": "+ - 0",
    // A visible ring inside the target's own edge, which the stage would clip outside it. Unzoomed, a finger still
    // scrolls the page; zoomed, it pans the plot.
    className: cn(
      "touch-pan-x touch-pan-y outline-none select-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
      "data-zoomed:cursor-grab data-zoomed:touch-none data-zoomed:active:cursor-grabbing",
    ),
    onPointerDown: (event: React.PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: React.PointerEvent) => {
      const all = pointers.current;
      const last = all.get(event.pointerId);
      if (!last) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const now = { x: event.clientX, y: event.clientY };
      const other = [...all].find(([id]) => id !== event.pointerId)?.[1];
      all.set(event.pointerId, now);
      if (other) {
        // A pinch: zoom by how far the fingers moved apart, around their middle, and follow the middle.
        const before = Math.hypot(last.x - other.x, last.y - other.y);
        const after = Math.hypot(now.x - other.x, now.y - other.y);
        if (!before) return;
        const at = relative((now.x + other.x) / 2, (now.y + other.y) / 2);
        const dx = (now.x - last.x) / 2 / rect.width;
        const dy = (now.y - last.y) / 2 / rect.height;
        update((current) => {
          const next = zoomChartAt(current, after / before, at, max);
          return clampChartZoom({ ...next, x: next.x + dx, y: next.y + dy }, max);
        });
        return;
      }
      const dx = (now.x - last.x) / rect.width;
      const dy = (now.y - last.y) / rect.height;
      update((current) => clampChartZoom({ ...current, x: current.x + dx, y: current.y + dy }, max));
    },
    onPointerUp: (event: React.PointerEvent) => pointers.current.delete(event.pointerId),
    onPointerCancel: (event: React.PointerEvent) => pointers.current.delete(event.pointerId),
    onDoubleClick: (event: React.MouseEvent) => {
      const at = relative(event.clientX, event.clientY);
      update((current) => zoomChartAt(current, ZOOM_STEP * ZOOM_STEP, at, max));
    },
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "+" || event.key === "=") zoomBy(ZOOM_STEP);
      else if (event.key === "-" || event.key === "_") zoomBy(1 / ZOOM_STEP);
      else if (event.key === "0") setView(CHART_ZOOM_IDENTITY);
      else if (event.key in ARROW && zoomed) {
        const [dx, dy] = ARROW[event.key];
        const step = PAN_STEP * (event.shiftKey ? 4 : 1);
        update((current) => clampChartZoom({ ...current, x: current.x + dx * step, y: current.y + dy * step }, max));
      } else return;
      event.preventDefault();
    },
  };

  return {
    view,
    targetProps,
    canZoomIn: view.scale < max,
    canZoomOut: zoomed,
    zoomIn: () => zoomBy(ZOOM_STEP),
    zoomOut: () => zoomBy(1 / ZOOM_STEP),
    reset: () => setView(CHART_ZOOM_IDENTITY),
  };
}

export type ChartZoom = ReturnType<typeof useChartZoom>;

interface ChartZoomControlsProps extends React.ComponentProps<"div"> {
  /** The plot's `useChartZoom`. */
  zoom: ChartZoom;
}

/**
 * The buttons of a `useChartZoom` plot in a glass pill, for a `ChartOverlay`: zoom out, zoom in and reset. A button
 * with nothing left to do stays focusable and is announced unavailable, so focus never drops off it at the limit.
 */
export function ChartZoomControls({ zoom, className, ...props }: ChartZoomControlsProps) {
  const buttons = [
    { label: "Zoom out", icon: Minus, enabled: zoom.canZoomOut, onClick: zoom.zoomOut },
    { label: "Zoom in", icon: Plus, enabled: zoom.canZoomIn, onClick: zoom.zoomIn },
    { label: "Reset zoom", icon: RotateCcw, enabled: zoom.canZoomOut, onClick: zoom.reset },
  ];
  return (
    <ChartOverlayItem
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the pill is a ChartOverlayItem (a div); a fieldset would need a legend this row of icon buttons has no room for
      role="group"
      aria-label="Zoom"
      data-slot="chart-zoom-controls"
      className={cn("gap-0.5 p-0.5", className)}
      {...props}
    >
      {buttons.map(({ label, icon: Icon, enabled, onClick }) => (
        <Button
          key={label}
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          aria-disabled={!enabled || undefined}
          onClick={() => {
            if (enabled) onClick();
          }}
        >
          <Icon aria-hidden="true" />
        </Button>
      ))}
    </ChartOverlayItem>
  );
}
