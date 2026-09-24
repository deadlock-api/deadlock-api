import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/community/")({
  beforeLoad: () => {
    throw redirect({ to: "/community/leaderboard", statusCode: 301 });
  },
});
