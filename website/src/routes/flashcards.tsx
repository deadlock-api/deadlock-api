import { createFileRoute, Outlet } from "@tanstack/react-router";

import { NEW_ROCKER_PRELOAD } from "~/lib/fonts";

export const Route = createFileRoute("/flashcards")({
  component: Outlet,
  head: () => ({ links: [NEW_ROCKER_PRELOAD] }),
});
