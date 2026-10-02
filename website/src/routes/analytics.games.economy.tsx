import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { gamesPageOptions } from "~/pages/analytics/GamesPageOptions";

export const Route = createFileRoute("/analytics/games/economy")({
  ...gamesPageOptions,
  component: lazyRouteComponent(() => import("~/pages/analytics/GamesEconomyPage"), "GamesEconomyPage"),
});
