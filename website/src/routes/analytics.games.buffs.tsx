import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { gamesPageOptions } from "~/pages/analytics/GamesPageOptions";

export const Route = createFileRoute("/analytics/games/buffs")({
  ...gamesPageOptions,
  component: lazyRouteComponent(() => import("~/pages/analytics/GamesBuffsPage"), "GamesBuffsPage"),
});
