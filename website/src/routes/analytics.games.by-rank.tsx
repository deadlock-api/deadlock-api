import { createFileRoute } from "@tanstack/react-router";

import { gamesPageOptions } from "~/pages/analytics/GamesPageOptions";

export const Route = createFileRoute("/analytics/games/by-rank")({ ...gamesPageOptions });
