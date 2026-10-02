import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { gamesPageOptions } from "~/pages/analytics/GamesPageOptions";

export const Route = createFileRoute("/analytics/games/by-rank")({
  ...gamesPageOptions,
  component: lazyRouteComponent(() => import("~/pages/analytics/GamesByRankPage"), "GamesByRankPage"),
});
