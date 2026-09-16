import { createFileRoute } from "@tanstack/react-router";

import { gamesPageOptions } from "~/pages/analytics/GamesPage";

export const Route = createFileRoute("/analytics/games/by-rank")({ ...gamesPageOptions });
