import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { gamesPageOptions } from "~/pages/analytics/GamesPageOptions";

export const Route = createFileRoute("/analytics/games/over-time")({
  ...gamesPageOptions,
  component: lazyRouteComponent(() => import("~/pages/analytics/GamesOverTimePage"), "GamesOverTimePage"),
});
