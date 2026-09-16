import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/analytics/items")({
  component: () => <Outlet />,
});
