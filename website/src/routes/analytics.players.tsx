import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/analytics/players")({ component: Outlet });
