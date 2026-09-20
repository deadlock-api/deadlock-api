import { createFileRoute, Outlet } from "@tanstack/react-router";
import { MotionConfig } from "framer-motion";

import { NEW_ROCKER_PRELOAD } from "~/lib/fonts";

export const Route = createFileRoute("/games_/flashcards")({
  component: FlashcardsLayout,
  head: () => ({ links: [NEW_ROCKER_PRELOAD] }),
});

function FlashcardsLayout() {
  return (
    <MotionConfig reducedMotion="user">
      <Outlet />
    </MotionConfig>
  );
}
