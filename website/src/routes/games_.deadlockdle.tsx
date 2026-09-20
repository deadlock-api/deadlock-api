import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { Crosshair } from "lucide-react";
import { useCallback, useState } from "react";

import { TargetCursor } from "~/components/features/deadlockdle/TargetCursor";
import { Button } from "~/components/ui/button";
import { StatusDot } from "~/components/ui/status-dot";
import { NEW_ROCKER_PRELOAD } from "~/lib/fonts";

const CURSOR_STORAGE_KEY = "deadlockdle:custom-cursor";

function useCursorToggle() {
  const [enabled, setEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(CURSOR_STORAGE_KEY) === "true";
  });

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      localStorage.setItem(CURSOR_STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  return [enabled, toggle] as const;
}

export const Route = createFileRoute("/games_/deadlockdle")({
  component: DeadlockdleLayout,
  head: () => ({ links: [NEW_ROCKER_PRELOAD] }),
});

const MotionStatusDot = motion.create(StatusDot);

function DeadlockdleLayout() {
  const [cursorEnabled, toggleCursor] = useCursorToggle();

  return (
    <MotionConfig reducedMotion="user">
      {cursorEnabled && <TargetCursor />}

      <div className="theme-terminal fixed end-3 top-3 z-50 md:end-4 md:top-4">
        <Button
          variant="outline"
          size="icon"
          onClick={toggleCursor}
          aria-pressed={cursorEnabled}
          aria-label="Custom cursor"
          title={cursorEnabled ? "Disable custom cursor" : "Enable custom cursor"}
          className="cursor-target relative"
        >
          <Crosshair className={cursorEnabled ? "text-primary" : "text-muted-foreground"} />

          <AnimatePresence>
            {cursorEnabled && (
              <MotionStatusDot
                tone="primary"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="absolute -end-0.5 -top-0.5"
              />
            )}
          </AnimatePresence>
        </Button>
      </div>

      <Outlet />
    </MotionConfig>
  );
}
