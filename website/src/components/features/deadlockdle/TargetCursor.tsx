import { gsap } from "gsap";
import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";

import { CHART_COLOR } from "~/components/patterns/charts/theme";
import { useHydrated } from "~/hooks/useHydrated";

interface TargetCursorProps {
  targetSelector?: string;
  spinDuration?: number;
  hideDefaultCursor?: boolean;
  hoverDuration?: number;
  parallaxOn?: boolean;
}

const CORNER_SIZE = 12;
const BORDER_WIDTH = 3;

/** Corner initial rest positions (pixel offsets from center) */
const REST_POSITIONS = [
  { key: "tl", x: -CORNER_SIZE * 1.5, y: -CORNER_SIZE * 1.5 },
  { key: "tr", x: CORNER_SIZE * 0.5, y: -CORNER_SIZE * 1.5 },
  { key: "br", x: CORNER_SIZE * 0.5, y: CORNER_SIZE * 0.5 },
  { key: "bl", x: -CORNER_SIZE * 1.5, y: CORNER_SIZE * 0.5 },
];

const CORNER_BORDERS: React.CSSProperties[] = [
  { borderRight: "none", borderBottom: "none" }, // TL
  { borderLeft: "none", borderBottom: "none" }, // TR
  { borderLeft: "none", borderTop: "none" }, // BR
  { borderRight: "none", borderTop: "none" }, // BL
];

/**
 * Targeting reticle cursor for the deadlockdle section.
 * Adapted from https://reactbits.dev/animations/target-cursor
 *
 * Spins continuously and snaps its corner brackets to frame any element
 * with the `cursor-target` class on hover.
 */
function isTouchDevice(): boolean {
  const hasTouchScreen = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const isSmallScreen = window.innerWidth <= 768;
  const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
  return (hasTouchScreen && isSmallScreen) || mobileRegex.test(navigator.userAgent.toLowerCase());
}

export function TargetCursor({
  targetSelector = ".cursor-target",
  spinDuration = 2,
  hideDefaultCursor = true,
  hoverDuration = 0.2,
  parallaxOn = true,
}: TargetCursorProps) {
  const cursorRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const cornerRefs = useRef<(HTMLDivElement | null)[]>([null, null, null, null]);

  // After hydration: the server has no device to ask, and a phone that dropped the cursor during hydration threw the
  // server markup away.
  const hydrated = useHydrated();
  const isMobile = useMemo(() => hydrated && isTouchDevice(), [hydrated]);

  useEffect(() => {
    if (isMobile || !cursorRef.current) return;

    const cursor = cursorRef.current;
    const corners = cornerRefs.current.filter(Boolean) as HTMLDivElement[];

    const originalCursor = document.body.style.cursor;
    let styleEl: HTMLStyleElement | null = null;
    if (hideDefaultCursor) {
      document.body.style.cursor = "none";
      // Override cursor:pointer / cursor:default on every element — a single
      // body rule isn't enough because child rules have higher specificity.
      styleEl = document.createElement("style");
      styleEl.textContent = "* { cursor: none !important; }";
      document.head.appendChild(styleEl);
    }

    let activeTarget: Element | null = null;
    let currentLeaveHandler: (() => void) | null = null;
    let resumeTimeout: ReturnType<typeof setTimeout> | null = null;
    let spinTl: gsap.core.Timeline | null = null;
    // A plain object, so GSAP can tween its `current` property directly.
    const strength = { current: 0 };
    let targetCornerPositions: { x: number; y: number }[] | null = null;

    const cleanupTarget = (target: Element) => {
      if (currentLeaveHandler) target.removeEventListener("mouseleave", currentLeaveHandler);
      currentLeaveHandler = null;
    };

    gsap.set(cursor, {
      xPercent: -50,
      yPercent: -50,
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });

    const createSpinTimeline = () => {
      spinTl?.kill();
      spinTl = gsap.timeline({ repeat: -1 }).to(cursor, { rotation: "+=360", duration: spinDuration, ease: "none" });
    };
    createSpinTimeline();

    const tickerFn = () => {
      if (!targetCornerPositions || !cursorRef.current) return;
      const pull = strength.current;
      if (pull === 0) return;
      const positions = targetCornerPositions;

      const cursorX = gsap.getProperty(cursorRef.current, "x") as number;
      const cursorY = gsap.getProperty(cursorRef.current, "y") as number;

      corners.forEach((corner, i) => {
        const cx = gsap.getProperty(corner, "x") as number;
        const cy = gsap.getProperty(corner, "y") as number;
        const tx = positions[i].x - cursorX;
        const ty = positions[i].y - cursorY;
        const duration = pull >= 0.99 ? (parallaxOn ? 0.2 : 0) : 0.05;
        gsap.to(corner, {
          x: cx + (tx - cx) * pull,
          y: cy + (ty - cy) * pull,
          duration,
          ease: duration === 0 ? "none" : "power1.out",
          overwrite: "auto",
        });
      });
    };

    const moveHandler = (e: MouseEvent) => {
      gsap.to(cursor, { x: e.clientX, y: e.clientY, duration: 0.1, ease: "power3.out" });
    };
    window.addEventListener("mousemove", moveHandler);

    const scrollHandler = () => {
      if (!activeTarget || !cursorRef.current) return;
      const mx = gsap.getProperty(cursorRef.current, "x") as number;
      const my = gsap.getProperty(cursorRef.current, "y") as number;
      const el = document.elementFromPoint(mx, my);
      const stillOver = el && (el === activeTarget || el.closest(targetSelector) === activeTarget);
      if (!stillOver && currentLeaveHandler) currentLeaveHandler();
    };
    window.addEventListener("scroll", scrollHandler, { passive: true });

    const mouseDownHandler = () => {
      gsap.to(dotRef.current, { scale: 0.7, duration: 0.3 });
      gsap.to(cursor, { scale: 0.9, duration: 0.2 });
    };
    const mouseUpHandler = () => {
      gsap.to(dotRef.current, { scale: 1, duration: 0.3 });
      gsap.to(cursor, { scale: 1, duration: 0.2 });
    };
    window.addEventListener("mousedown", mouseDownHandler);
    window.addEventListener("mouseup", mouseUpHandler);

    const enterHandler = (e: MouseEvent) => {
      let target: Element | null = null;
      let el = e.target as Element | null;
      while (el && el !== document.body) {
        if (el.matches(targetSelector)) {
          target = el;
          break;
        }
        el = el.parentElement;
      }
      if (!target || !cursorRef.current) return;
      if (activeTarget === target) return;
      if (activeTarget) cleanupTarget(activeTarget);
      if (resumeTimeout) {
        clearTimeout(resumeTimeout);
        resumeTimeout = null;
      }

      activeTarget = target;
      corners.forEach((c) => gsap.killTweensOf(c));
      gsap.killTweensOf(cursorRef.current, "rotation");
      spinTl?.pause();
      gsap.set(cursorRef.current, { rotation: 0 });

      const rect = target.getBoundingClientRect();
      const cursorX = gsap.getProperty(cursorRef.current, "x") as number;
      const cursorY = gsap.getProperty(cursorRef.current, "y") as number;

      const positions = [
        { x: rect.left - BORDER_WIDTH, y: rect.top - BORDER_WIDTH },
        { x: rect.right + BORDER_WIDTH - CORNER_SIZE, y: rect.top - BORDER_WIDTH },
        { x: rect.right + BORDER_WIDTH - CORNER_SIZE, y: rect.bottom + BORDER_WIDTH - CORNER_SIZE },
        { x: rect.left - BORDER_WIDTH, y: rect.bottom + BORDER_WIDTH - CORNER_SIZE },
      ];

      targetCornerPositions = positions;

      gsap.ticker.add(tickerFn);
      gsap.to(strength, { current: 1, duration: hoverDuration, ease: "power2.out" });

      corners.forEach((corner, i) => {
        gsap.to(corner, {
          x: positions[i].x - cursorX,
          y: positions[i].y - cursorY,
          duration: 0.2,
          ease: "power2.out",
        });
      });

      const leaveHandler = () => {
        gsap.ticker.remove(tickerFn);
        targetCornerPositions = null;
        strength.current = 0;
        activeTarget = null;

        gsap.killTweensOf(corners);
        const tl = gsap.timeline();
        corners.forEach((corner, i) => {
          tl.to(corner, { x: REST_POSITIONS[i].x, y: REST_POSITIONS[i].y, duration: 0.3, ease: "power3.out" }, 0);
        });

        resumeTimeout = setTimeout(() => {
          if (!activeTarget && spinTl) {
            const rot = (gsap.getProperty(cursor, "rotation") as number) % 360;
            createSpinTimeline();
            gsap.to(cursor, {
              rotation: rot + 360,
              duration: spinDuration * (1 - rot / 360),
              ease: "none",
              onComplete: () => {
                spinTl?.restart();
              },
            });
          }
          resumeTimeout = null;
        }, 50);

        cleanupTarget(target);
      };

      currentLeaveHandler = leaveHandler;
      target.addEventListener("mouseleave", leaveHandler);
    };

    window.addEventListener("mouseover", enterHandler, { passive: true });

    return () => {
      gsap.ticker.remove(tickerFn);
      if (resumeTimeout) clearTimeout(resumeTimeout);
      window.removeEventListener("mousemove", moveHandler);
      window.removeEventListener("mouseover", enterHandler);
      window.removeEventListener("scroll", scrollHandler);
      window.removeEventListener("mousedown", mouseDownHandler);
      window.removeEventListener("mouseup", mouseUpHandler);
      if (activeTarget) cleanupTarget(activeTarget);
      spinTl?.kill();
      document.body.style.cursor = originalCursor;
      styleEl?.remove();
    };
  }, [targetSelector, spinDuration, hideDefaultCursor, isMobile, hoverDuration, parallaxOn]);

  if (isMobile) return null;

  const PRIMARY = CHART_COLOR.primary;

  const cornerBase: React.CSSProperties = {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    border: `${BORDER_WIDTH}px solid ${PRIMARY}`,
    willChange: "transform",
  };

  // Portal into document.body so position:fixed is always relative to the
  // true viewport — bypassing any ancestor backdrop-filter containing block.
  return createPortal(
    <div
      ref={cursorRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: 0,
        height: 0,
        pointerEvents: "none",
        zIndex: 9999,
        filter:
          "drop-shadow(0 0 4px color-mix(in srgb, var(--primary) 80%, transparent)) drop-shadow(0 0 10px color-mix(in srgb, var(--primary) 35%, transparent))",
      }}
    >
      <div
        ref={dotRef}
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 4,
          height: 4,
          backgroundColor: PRIMARY,
          borderRadius: "50%",
          transform: "translate(-50%, -50%)",
          willChange: "transform",
        }}
      />
      {REST_POSITIONS.map((pos, i) => (
        <div
          key={pos.key}
          ref={(el) => {
            cornerRefs.current[i] = el;
          }}
          style={{
            ...cornerBase,
            ...CORNER_BORDERS[i],
            transform: `translate(${pos.x}px, ${pos.y}px)`,
          }}
        />
      ))}
    </div>,
    document.body,
  );
}
