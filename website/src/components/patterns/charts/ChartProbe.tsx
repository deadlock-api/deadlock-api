import { type ReactNode, type RefObject, useState } from "react";

import { TooltipCard } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

/** Where a probe sits: `rel` on the target (0 to 1 on each axis), `px` in the box its card is placed in. */
export interface ChartProbePoint {
  rel: { x: number; y: number };
  px: { x: number; y: number };
  /** The size of that box, which decides the side the card opens to. */
  box: { width: number; height: number };
  /** How it got there. A mouse probe follows the cursor and is not announced; a tap or a key press is. */
  source: "mouse" | "touch" | "keyboard";
}

/** The arrow keys move the probe by this share of the target. */
const KEY_STEP = 1 / 32;
const ARROW: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/**
 * The reading under a point of a plot drawn on a canvas, by every input: the mouse moves it, a tap places it, and on
 * the focused target the arrow keys step it (Shift for bigger steps), Home centres it and Escape removes it. Spread
 * `targetProps` on the drawn element; `boxRef` is the positioned box that holds it and the `ChartProbeCard`.
 */
export function useChartProbe(boxRef: RefObject<HTMLElement | null>) {
  const [point, setPoint] = useState<ChartProbePoint | null>(null);

  const place = (target: Element, rel: { x: number; y: number }, source: ChartProbePoint["source"]) => {
    const box = boxRef.current;
    if (!box) return;
    const targetRect = target.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, rel.x));
    const y = Math.min(1, Math.max(0, rel.y));
    setPoint({
      rel: { x, y },
      px: {
        x: targetRect.left - boxRect.left + x * targetRect.width,
        y: targetRect.top - boxRect.top + y * targetRect.height,
      },
      box: { width: boxRect.width, height: boxRect.height },
      source,
    });
  };

  const fromPointer = (event: React.PointerEvent, source: ChartProbePoint["source"]) => {
    const rect = event.currentTarget.getBoundingClientRect();
    place(
      event.currentTarget,
      { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height },
      source,
    );
  };

  const targetProps = {
    tabIndex: 0,
    "data-slot": "chart-probe-target",
    // A visible ring inside the target's own edge, which the stage would clip outside it.
    className:
      "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
    onPointerMove: (event: React.PointerEvent) => {
      if (event.pointerType === "mouse") fromPointer(event, "mouse");
    },
    onPointerDown: (event: React.PointerEvent) => {
      if (event.pointerType !== "mouse") fromPointer(event, "touch");
    },
    onPointerLeave: (event: React.PointerEvent) => {
      if (event.pointerType === "mouse") setPoint(null);
    },
    onKeyDown: (event: React.KeyboardEvent) => {
      const target = event.currentTarget;
      const step = KEY_STEP * (event.shiftKey ? 4 : 1);
      const from = point?.rel ?? { x: 0.5, y: 0.5 };
      if (event.key in ARROW) {
        event.preventDefault();
        const [dx, dy] = ARROW[event.key];
        place(target, point ? { x: from.x + dx * step, y: from.y + dy * step } : from, "keyboard");
      } else if (event.key === "Home") {
        event.preventDefault();
        place(target, { x: 0.5, y: 0.5 }, "keyboard");
      } else if (event.key === "Escape" && point) {
        event.preventDefault();
        setPoint(null);
      }
    },
    onBlur: () => {
      if (point?.source === "keyboard") setPoint(null);
    },
  };

  return { point, targetProps, clear: () => setPoint(null) };
}

/**
 * The card of a `useChartProbe` reading, beside the point and inside its box: it opens to the side and the end with
 * more room, so it never leaves a phone's screen. A keyboard probe also draws a ring at the point. `announce` is the
 * reading in words, read out politely when a tap or a key moved the probe (a mouse probe is not read out); the card
 * itself is hidden from assistive technology, so the reading is read once.
 */
export function ChartProbeCard({
  point,
  announce,
  className,
  children,
}: {
  point: ChartProbePoint | null;
  announce: string;
  className?: string;
  /** The reading; leave it empty where there is nothing under the point. */
  children?: ReactNode;
}) {
  const flipX = point ? point.px.x > point.box.width / 2 : false;
  const flipY = point ? point.px.y > point.box.height / 2 : false;
  return (
    <>
      <output data-slot="chart-probe-status" className="sr-only">
        {point && point.source !== "mouse" ? announce : ""}
      </output>
      {point?.source === "keyboard" && (
        <span
          aria-hidden="true"
          data-slot="chart-probe-cursor"
          className="pointer-events-none absolute z-40 size-4 -translate-1/2 rounded-full ring-2 ring-ring"
          style={{ left: point.px.x, top: point.px.y }}
        />
      )}
      {point && children && (
        // The padding is the gap between the point and the card, on whichever side it opens to.
        <div
          aria-hidden="true"
          data-slot="chart-probe-card"
          className={cn(
            "pointer-events-none absolute z-50 px-3 py-2",
            flipX && "-translate-x-full",
            flipY && "-translate-y-full",
          )}
          style={{ left: point.px.x, top: point.px.y }}
        >
          <TooltipCard className={cn("w-max", className)}>{children}</TooltipCard>
        </div>
      )}
    </>
  );
}
