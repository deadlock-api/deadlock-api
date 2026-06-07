import { useCallback, useEffect, useRef, useState } from "react";

import type { MapView } from "~/lib/coach/report";

// Pan/zoom for the square map surface. The camera is stored resolution-free as
// `{ cx, cy, scale }` — the normalized map point sitting at the viewport center,
// plus a magnification. The CSS transform (`translate(tx, ty) scale(scale)`
// about the top-left) is derived from the camera and the measured pixel size at
// render time, so the same camera survives a resize and every child layer (image,
// SVG overlays, HTML markers) stays aligned: we only move the camera, never the
// elements. The camera is clamped so the scaled content always covers the view.

export const MAX_SCALE = 6;
const MIN_SCALE = 1;

interface Camera {
  cx: number;
  cy: number;
  scale: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// At magnification `scale` the center can range over [half, 1 - half] on each
// axis (half = 0.5/scale); at scale 1 it is locked to the map center.
function clampCamera(cam: Camera): Camera {
  const scale = clamp(cam.scale, MIN_SCALE, MAX_SCALE);
  const half = 0.5 / scale;
  return { scale, cx: clamp(cam.cx, half, 1 - half), cy: clamp(cam.cy, half, 1 - half) };
}

function cameraFor(view: MapView | null | undefined): Camera {
  if (!view) return { cx: 0.5, cy: 0.5, scale: 1 };
  return clampCamera({ cx: view.at.x, cy: view.at.y, scale: view.zoom ?? 1 });
}

interface PointerHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
}

export interface PanZoom {
  containerRef: React.RefObject<HTMLDivElement | null>;
  transform: string;
  scale: number;
  isZoomed: boolean;
  dragging: boolean;
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
  /** Spread onto the container element to wire up drag + pinch. */
  bind: PointerHandlers;
}

export function usePanZoom(view?: MapView | null, enabled = true): PanZoom {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(0);
  const [cam, setCam] = useState<Camera>(() => cameraFor(view));
  const [dragging, setDragging] = useState(false);
  // Active pointers (drag + two-finger pinch) and the last pinch distance.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDist = useRef<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setSize(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Zoom about a viewport point (px, py), keeping the map point under it fixed.
  const zoomAbout = useCallback(
    (px: number, py: number, factor: number) => {
      if (size === 0) return;
      setCam((prev) => {
        const scale = clamp(prev.scale * factor, MIN_SCALE, MAX_SCALE);
        if (scale === prev.scale) return prev;
        const mx = prev.cx + (px - size / 2) / (size * prev.scale);
        const my = prev.cy + (py - size / 2) / (size * prev.scale);
        return clampCamera({
          scale,
          cx: mx - (px - size / 2) / (size * scale),
          cy: my - (py - size / 2) / (size * scale),
        });
      });
    },
    [size],
  );

  const zoomAtCenter = useCallback((factor: number) => zoomAbout(size / 2, size / 2, factor), [zoomAbout, size]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAbout(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.0015));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [enabled, zoomAbout]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      e.currentTarget.setPointerCapture(e.pointerId);
      if (pointers.current.size === 1) setDragging(true);
    },
    [enabled],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const prev = pointers.current.get(e.pointerId);
      if (!prev || size === 0) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pts = [...pointers.current.values()];
      if (pts.length >= 2) {
        // Pinch: zoom about the midpoint by the change in finger distance.
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (pinchDist.current != null && pinchDist.current > 0) {
          const rect = e.currentTarget.getBoundingClientRect();
          zoomAbout(
            (pts[0].x + pts[1].x) / 2 - rect.left,
            (pts[0].y + pts[1].y) / 2 - rect.top,
            dist / pinchDist.current,
          );
        }
        pinchDist.current = dist;
        return;
      }
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      setCam((c) =>
        clampCamera({ scale: c.scale, cx: c.cx - dx / (size * c.scale), cy: c.cy - dy / (size * c.scale) }),
      );
    },
    [size, zoomAbout],
  );

  const endPointer = useCallback((e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchDist.current = null;
    if (pointers.current.size === 0) setDragging(false);
  }, []);

  // Derive the pixel transform from the camera + measured size.
  const tx = size === 0 ? 0 : size / 2 - cam.cx * size * cam.scale;
  const ty = size === 0 ? 0 : size / 2 - cam.cy * size * cam.scale;

  return {
    containerRef,
    transform: `translate(${tx}px, ${ty}px) scale(${cam.scale})`,
    scale: cam.scale,
    isZoomed: cam.scale > 1.001,
    dragging,
    zoomIn: () => zoomAtCenter(1.4),
    zoomOut: () => zoomAtCenter(1 / 1.4),
    reset: () => setCam(cameraFor(view)),
    bind: { onPointerDown, onPointerMove, onPointerUp: endPointer, onPointerCancel: endPointer },
  };
}
