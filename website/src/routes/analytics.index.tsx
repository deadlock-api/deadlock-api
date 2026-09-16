import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/analytics/")({
  beforeLoad: () => {
    throw redirect({ to: "/analytics/games" });
  },
});
