import { AnimatePresence, motion } from "framer-motion";
import { Crosshair } from "lucide-react";
import { useCallback, useState } from "react";
import { Outlet } from "react-router";

import { TargetCursor } from "./components/TargetCursor";

const CURSOR_STORAGE_KEY = "deadlockdle:custom-cursor";

function useCursorToggle() {
  const [enabled, setEnabled] = useState(() => localStorage.getItem(CURSOR_STORAGE_KEY) === "true");

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      localStorage.setItem(CURSOR_STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  return [enabled, toggle] as const;
}

export default function DeadlockdleLayout() {
  const [cursorEnabled, toggleCursor] = useCursorToggle();

  return (
    <>
      {cursorEnabled && <TargetCursor />}

      <div className="fixed top-3 right-3 z-50 md:top-4 md:right-4">
        <motion.button
          type="button"
          onClick={toggleCursor}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          className="group relative flex size-9 items-center justify-center rounded-full border border-border/50 bg-background/80 shadow-sm backdrop-blur-sm transition-colors hover:border-primary/50 hover:bg-primary/5"
          title={cursorEnabled ? "Disable custom cursor" : "Enable custom cursor"}
        >
          <Crosshair
            className={`size-4 transition-colors ${cursorEnabled ? "text-primary" : "text-muted-foreground"}`}
          />

          <AnimatePresence>
            {cursorEnabled && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary shadow-[0_0_6px_rgba(250,68,84,0.6)]"
              />
            )}
          </AnimatePresence>
        </motion.button>
      </div>

      <Outlet />
    </>
  );
}
