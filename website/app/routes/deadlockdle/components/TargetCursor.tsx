import { gsap } from "gsap";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";

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
  { x: -CORNER_SIZE * 1.5, y: -CORNER_SIZE * 1.5 }, // TL
  { x: CORNER_SIZE * 0.5, y: -CORNER_SIZE * 1.5 }, // TR
  { x: CORNER_SIZE * 0.5, y: CORNER_SIZE * 0.5 }, // BR
  { x: -CORNER_SIZE * 1.5, y: CORNER_SIZE * 0.5 }, // BL
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

  const spinTlRef = useRef<gsap.core.Timeline | null>(null);
  const tickerFnRef = useRef<(() => void) | null>(null);
  // Plain object so GSAP can tween its `current` property directly
  const strengthRef = useRef({ current: 0 });
  const targetCornerPositionsRef = useRef<{ x: number; y: number }[] | null>(null);

  const isMobile = useMemo(() => {
    if (typeof window === "undefined") return false;
    const hasTouchScreen = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    const isSmallScreen = window.innerWidth <= 768;
    const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
    return (hasTouchScreen && isSmallScreen) || mobileRegex.test(navigator.userAgent.toLowerCase());
  }, []);

  const moveCursor = useCallback((x: number, y: number) => {
    if (!cursorRef.current) return;
    gsap.to(cursorRef.current, { x, y, duration: 0.1, ease: "power3.out" });
  }, []);

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
      spinTlRef.current?.kill();
      spinTlRef.current = gsap
        .timeline({ repeat: -1 })
        .to(cursor, { rotation: "+=360", duration: spinDuration, ease: "none" });
    };
    createSpinTimeline();

    const tickerFn = () => {
      if (!targetCornerPositionsRef.current || !cursorRef.current) return;
      const strength = strengthRef.current.current;
      if (strength === 0) return;

      const cursorX = gsap.getProperty(cursorRef.current, "x") as number;
      const cursorY = gsap.getProperty(cursorRef.current, "y") as number;

      corners.forEach((corner, i) => {
        const cx = gsap.getProperty(corner, "x") as number;
        const cy = gsap.getProperty(corner, "y") as number;
        const tx = targetCornerPositionsRef.current![i].x - cursorX;
        const ty = targetCornerPositionsRef.current![i].y - cursorY;
        const duration = strength >= 0.99 ? (parallaxOn ? 0.2 : 0) : 0.05;
        gsap.to(corner, {
          x: cx + (tx - cx) * strength,
          y: cy + (ty - cy) * strength,
          duration,
          ease: duration === 0 ? "none" : "power1.out",
          overwrite: "auto",
        });
      });
    };
    tickerFnRef.current = tickerFn;

    const moveHandler = (e: MouseEvent) => moveCursor(e.clientX, e.clientY);
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
      spinTlRef.current?.pause();
      gsap.set(cursorRef.current, { rotation: 0 });

      const rect = target.getBoundingClientRect();
      const cursorX = gsap.getProperty(cursorRef.current, "x") as number;
      const cursorY = gsap.getProperty(cursorRef.current, "y") as number;

      targetCornerPositionsRef.current = [
        { x: rect.left - BORDER_WIDTH, y: rect.top - BORDER_WIDTH },
        { x: rect.right + BORDER_WIDTH - CORNER_SIZE, y: rect.top - BORDER_WIDTH },
        { x: rect.right + BORDER_WIDTH - CORNER_SIZE, y: rect.bottom + BORDER_WIDTH - CORNER_SIZE },
        { x: rect.left - BORDER_WIDTH, y: rect.bottom + BORDER_WIDTH - CORNER_SIZE },
      ];

      gsap.ticker.add(tickerFn);
      gsap.to(strengthRef.current, { current: 1, duration: hoverDuration, ease: "power2.out" });

      corners.forEach((corner, i) => {
        gsap.to(corner, {
          x: targetCornerPositionsRef.current![i].x - cursorX,
          y: targetCornerPositionsRef.current![i].y - cursorY,
          duration: 0.2,
          ease: "power2.out",
        });
      });

      const leaveHandler = () => {
        gsap.ticker.remove(tickerFn);
        targetCornerPositionsRef.current = null;
        strengthRef.current.current = 0;
        activeTarget = null;

        gsap.killTweensOf(corners);
        const tl = gsap.timeline();
        corners.forEach((corner, i) => {
          tl.to(corner, { x: REST_POSITIONS[i].x, y: REST_POSITIONS[i].y, duration: 0.3, ease: "power3.out" }, 0);
        });

        resumeTimeout = setTimeout(() => {
          if (!activeTarget && cursorRef.current && spinTlRef.current) {
            const rot = (gsap.getProperty(cursorRef.current, "rotation") as number) % 360;
            spinTlRef.current.kill();
            spinTlRef.current = gsap
              .timeline({ repeat: -1 })
              .to(cursorRef.current, { rotation: "+=360", duration: spinDuration, ease: "none" });
            gsap.to(cursorRef.current, {
              rotation: rot + 360,
              duration: spinDuration * (1 - rot / 360),
              ease: "none",
              onComplete: () => {
                spinTlRef.current?.restart();
              },
            });
          }
          resumeTimeout = null;
        }, 50);

        cleanupTarget(target!);
      };

      currentLeaveHandler = leaveHandler;
      target.addEventListener("mouseleave", leaveHandler);
    };

    window.addEventListener("mouseover", enterHandler, { passive: true });

    return () => {
      if (tickerFnRef.current) gsap.ticker.remove(tickerFnRef.current);
      window.removeEventListener("mousemove", moveHandler);
      window.removeEventListener("mouseover", enterHandler);
      window.removeEventListener("scroll", scrollHandler);
      window.removeEventListener("mousedown", mouseDownHandler);
      window.removeEventListener("mouseup", mouseUpHandler);
      if (activeTarget) cleanupTarget(activeTarget);
      spinTlRef.current?.kill();
      document.body.style.cursor = originalCursor;
      styleEl?.remove();
      targetCornerPositionsRef.current = null;
      strengthRef.current.current = 0;
    };
  }, [targetSelector, spinDuration, moveCursor, hideDefaultCursor, isMobile, hoverDuration, parallaxOn]);

  if (isMobile) return null;

  const PRIMARY = "#fa4454";

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
        filter: "drop-shadow(0 0 4px rgba(250,68,84,0.8)) drop-shadow(0 0 10px rgba(250,68,84,0.35))",
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
          key={i}
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
