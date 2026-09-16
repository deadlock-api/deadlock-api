import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/analytics/heroes")({
  component: () => <Outlet />,
});
