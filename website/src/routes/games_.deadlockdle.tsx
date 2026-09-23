import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { Crosshair } from "lucide-react";
import { useCallback } from "react";

import { TargetCursor } from "~/components/features/deadlockdle/TargetCursor";
import { Button } from "~/components/ui/button";
import { StatusDot } from "~/components/ui/status-dot";
import { useStoredState } from "~/lib/deadlockdle/use-stored-state";
import { NEW_ROCKER_PRELOAD } from "~/lib/fonts";

const CURSOR_STORAGE_KEY = "deadlockdle:custom-cursor";

function useCursorToggle() {
  // Stored as the JSON literal "true" / "false"; off until hydrated so the server markup matches.
  const [enabled, setEnabled] = useStoredState(CURSOR_STORAGE_KEY, () => false);
  const toggle = useCallback(() => setEnabled(!enabled), [enabled, setEnabled]);

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
