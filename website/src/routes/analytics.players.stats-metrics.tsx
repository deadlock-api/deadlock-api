import { createFileRoute } from "@tanstack/react-router";

import { playersPageOptions } from "~/pages/analytics/PlayersPage";

export const Route = createFileRoute("/analytics/players/stats-metrics")({ ...playersPageOptions });
