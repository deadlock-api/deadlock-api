import { createFileRoute } from "@tanstack/react-router";

import { playersPageOptions } from "~/pages/analytics/PlayersPageOptions";

export const Route = createFileRoute("/analytics/players/stats-metrics")({ ...playersPageOptions });
