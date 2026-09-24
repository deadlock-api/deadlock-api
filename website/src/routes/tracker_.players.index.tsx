import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/tracker_/players/")({
  beforeLoad: () => {
    throw redirect({ to: "/tracker", statusCode: 301 });
  },
});
