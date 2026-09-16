import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/analytics/games")({ component: Outlet });
